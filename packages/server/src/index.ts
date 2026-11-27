/**
 * index.ts — eTaxAgent サーバー（Hono / Bun）のエントリーポイント。
 *
 * 構成:
 *   routes/       ルート登録のみ（usecases を組み合わせる）
 *   usecases/     ルート定義＋ハンドラ（1ファイル1ユースケース）
 *   schemas/      Zod スキーマ（@hono/zod-openapi の .openapi 名つき）
 *   gateways/     外部API接続（LLM）
 *   repositories/ Drizzle データアクセス
 *   services/     複数ユースケースで共有する業務ロジック（ドメイン別）
 *   lib/          共通インスタンス・設定（DB / AGENT_*）
 *
 * エンドポイント:
 *   GET    /api/health              疎通確認（DB・LLMの設定有無も返す）
 *   POST   /api/calc/aggregate      所得集計＋青色申告特別控除（DB不要・ステートレス）
 *   POST   /api/calc/consumption    消費税3方式比較（DB不要・ステートレス）
 *   POST   /api/calc/amend          修正申告の差分（DB不要・ステートレス）
 *   GET    /api/transactions        取引一覧（DB）
 *   POST   /api/transactions        取引登録（DB）
 *   POST   /api/transactions/replace-year 1年分の取引を置き換え保存（DB）
 *   PUT    /api/transactions/{id}   取引更新（DB）
 *   DELETE /api/transactions/{id}   取引削除（DB）
 *   GET    /api/imports             取込履歴（DB）
 *   POST   /api/import/csv          CSV取込（AI/ヒューリスティクス自動マッピング）
 *   POST   /api/agent/chat          対話エージェント（要 AGENT_API_KEY）
 *   POST   /api/classify/account    勘定科目の判定（履歴→SystemOne→ルール）
 *   POST   /api/classify/batch      勘定科目の一括判定（カード明細等）
 *   POST   /api/classify/feedback   確定した科目を学習履歴に記録
 *   POST   /api/receipts/analyze    領収書画像の読み取り＋科目判定（要 AGENT_API_KEY）
 *   POST   /api/files/presign-upload アップロード受け口URLの発行（ローカル保存）
 *   GET    /api/freee/trial-balance freee試算表（データディレクトリの取り込み済み実績）
 *   POST   /api/etax/export-xtx     e-Tax 申告等データ（XTX）の出力（DB不要・ステートレス）
 *   GET    /openapi.json            OpenAPI ドキュメント（全ルートのスペック）
 *   ALL    /mcp                     MCP（外部エージェント連携。認証はユーザーごとの
 *                                   APIトークン（設定画面で発行、Bearer）。認証フロー
 *                                   自体は対象外でトークンが代替する。MCP_TOKEN は
 *                                   単一テナントのローカル運用向けのマスタートークン）
 *
 * DB は PostgreSQL（DATABASE_URL）で、起動時にテーブルを自己修復する。
 * 起動時は packages/web のビルド成果物（dist）も同一ポートで配信する
 * （React は静的ファイルなので、公開するポートはこの1つで足りる）。
 * 最終提出（e-Tax）は本サーバーでは行わない（納税者本人の操作）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { join } from "node:path";
import { ACCOUNT_CRITERIA } from "@etax/shared";
import { ensureTables, getDb, isDatabaseConfigured, tablesReady } from "./lib/db";
import { encryptionEnabled } from "./lib/encryption";
import {
  databaseErrorKind,
  databaseFailureMessage,
  databaseInputErrorMessage,
} from "./lib/errors";
import { publicBaseUrl } from "./lib/publicUrl";
import { defaultValidationHook } from "./lib/validationHook";
import { billingEnabled } from "./gateways/stripeGateway";
import { StorageError, StorageObjectNotFoundError } from "./gateways/storageGateway";
import { hasActivePlan } from "./repositories/subscriptionRepository";
import { authRequired, runWithTenant } from "./lib/tenantContext";
import { requiresSessionCredential, resolveRequestCredential } from "./usecases/authSession";
import {
  OPENAPI_DOCUMENT_PATH,
  createOpenApiDocumentHandler,
} from "./usecases/getOpenApiDocument";
import { seedTaxKnowledge } from "./services/knowledge/seedTaxKnowledge";
import { AgentChatError } from "./services/agent/executeAgentChat";
import { FilingSubmissionError } from "./services/filingSubmission/filingSubmissionRecords";
import { InvoiceDocumentError } from "./services/invoice/invoiceDocuments";
import { PdfFormError } from "./services/pdf/formPdfExports";
import { ReceiptAnalysisError } from "./services/receipts/analyzeReceiptDraft";
import { ReconciliationError } from "./services/reconciliation/reconcileInvoice";
import { deleteExpiredAuthRows } from "./repositories/userRepository";
import { createSystemOneClient } from "./gateways/systemOneGateway";
import { loadSystemOneConfig } from "./lib/config";
import { loadSystemOneSettings } from "./repositories/systemOneSettingsRepository";
import { loadJevPromptOverride } from "./repositories/jevPromptRepository";
import { loadRegexRulesOverride } from "./repositories/regexRulesRepository";
import agentRoutes from "./routes/agent";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import calcRoutes from "./routes/calc";
import cashFlowRoutes from "./routes/cashFlow";
import classifyRoutes from "./routes/classify";
import etaxRoutes from "./routes/etax";
import filesRoutes from "./routes/files";
import filingSnapshotsRoutes from "./routes/filingSnapshots";
import businessStartRoutes from "./routes/businessStart";
import filingInputsRoutes from "./routes/filingInputs";
import filingStatusRoutes from "./routes/filingStatus";
import filingSubmissionsRoutes from "./routes/filingSubmissions";
import fixedAssetsRoutes from "./routes/fixedAssets";
import freeeRoutes from "./routes/freee";
import healthRoutes from "./routes/health";
import importsRoutes from "./routes/imports";
import invoicesRoutes from "./routes/invoices";
import mcpRoutes from "./routes/mcp";
import receiptsRoutes from "./routes/receipts";
import settingsRoutes from "./routes/settings";
import taxpayerRoutes from "./routes/taxpayer";
import transactionsRoutes from "./routes/transactions";

// 子ルートのバリデーション失敗も、個別のフックが無ければこの defaultHook で
// { error } 形式の 400 にする（子アプリは親の defaultHook を辿る）。
const app = new OpenAPIHono({ defaultHook: defaultValidationHook });

/**
 * 他オリジンから API を使ってよいオリジン。画面は同一オリジン配信が前提なので、
 * 通常は不要。許可するのは公開オリジン（ETAX_PUBLIC_URL）と ETAX_CORS_ORIGINS
 * （カンマ区切り）だけで、認証オフのローカル運用に限って localhost の開発
 * オリジン（Vite の開発サーバーなど）も許可する。
 */
function isAllowedOrigin(origin: string): boolean {
  const fromEnv = (process.env.ETAX_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (fromEnv.includes(origin) || publicBaseUrl() === origin) return true;
  return !authRequired() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// セッション Cookie を使うため credentials は true（ワイルドカードとは併用不可）。
app.use(
  "/api/*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : undefined),
    credentials: true,
  }),
);

/**
 * 更新系リクエストの送信元検査（CSRF 対策）。CORS は他オリジンに応答を
 * 読ませないだけで処理は止めないため、プリフライトの要らない単純リクエスト
 * （text/plain の POST など）が他サイトから届くと、認証の無いローカル運用では
 * 帳簿を書き換えられてしまう。ブラウザが付ける Origin を見て、同一オリジン
 * （Sec-Fetch-Site か Host との一致）と許可オリジンだけを通す。Origin を付けない
 * クライアント（native アプリ・CLI・サーバー間の呼び出し）はそのまま通す。
 */
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOriginRequest(c: Context, origin: string): boolean {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return true;
  try {
    return new URL(origin).host === c.req.header("host");
  } catch {
    return false;
  }
}

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  if (safeMethods.has(c.req.method) || origin === undefined) return next();
  if (isSameOriginRequest(c, origin) || isAllowedOrigin(origin)) return next();
  return c.json({ error: "許可されていない送信元からのリクエストです" }, 403);
});

// リクエストボディの上限（巨大ボディでのメモリ枯渇を防ぐ）。
// CSV 取込・領収書画像の PUT もこの範囲に収まる大きさにしている。
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 25 * 1024 * 1024,
    onError: (c) => c.json({ error: "リクエストが大きすぎます（上限 25MB）" }, 413),
  }),
);

// 起動時初期化（テーブル自己修復）はバックグラウンドで進むため、
// DB を使う初回リクエストが初期化完了前に走ると失敗する。
// 完了を短時間だけ待ってから処理する（DB 未設定・疎通確認は待たない）。
app.use("/api/*", async (c, next) => {
  if (c.req.path !== "/api/health" && isDatabaseConfigured()) {
    await Promise.race([
      tablesReady(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  await next();
});

/**
 * 認証ミドルウェア: セッション/APIキーからユーザーを解決し、テナント文脈を
 * 載せて後続を実行する。ETAX_AUTH_MODE=required（SaaS）のときは認証の無い
 * リクエストを 401 にする（/api/auth/* と /api/health は除く）。
 * API キーの発行・失効と2段階認証の設定は、API キーでは 403 にする。
 * 認証オフ（既定）のローカル運用では文脈だけ載せて素通しする。
 */
async function authMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const path = c.req.path;
  const isPublic =
    path.startsWith("/api/auth/") || path === "/api/health" || path === "/api/billing/webhook";
  const db = getDb();
  const credential = db ? await resolveRequestCredential(db, c) : undefined;
  if (credential === undefined) {
    if (authRequired() && !isPublic) {
      return c.json({ error: "ログインが必要です" }, 401);
    }
    return next();
  }
  if (credential.kind === "apiKey" && requiresSessionCredential(path)) {
    return c.json(
      { error: "この操作はAPIキーでは行えません。画面からログインして操作してください" },
      403,
    );
  }
  return runWithTenant(credential.userId, () => next());
}
app.use("/api/*", authMiddleware);
app.use("/mcp", authMiddleware);

/**
 * プランゲート: SaaS モード（認証必須＋課金有効）のときだけ、XTX 出力などの
 * 有料機能は有効なプラン（active / trialing）を必須にする。
 * ローカル運用・課金未設定では制限しない。
 */
async function planGateMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (!authRequired() || !billingEnabled()) return next();
  const db = getDb();
  if (!db) return next();
  if (await hasActivePlan(db)) return next();
  return c.json(
    { error: "この機能は有料プラン（月額490円）への加入が必要です" },
    402,
  );
}
app.use("/api/etax/*", planGateMiddleware);

app.route("/", healthRoutes);
app.route("/", authRoutes);
app.route("/", billingRoutes);
app.route("/", calcRoutes);
app.route("/", transactionsRoutes);
app.route("/", importsRoutes);
app.route("/", invoicesRoutes);
app.route("/", cashFlowRoutes);
app.route("/", agentRoutes);
app.route("/", classifyRoutes);
app.route("/", receiptsRoutes);
app.route("/", settingsRoutes);
app.route("/", filesRoutes);
app.route("/", freeeRoutes);
app.route("/", filingStatusRoutes);
app.route("/", filingSubmissionsRoutes);
app.route("/", filingSnapshotsRoutes);
app.route("/", filingInputsRoutes);
app.route("/", businessStartRoutes);
app.route("/", taxpayerRoutes);
app.route("/", fixedAssetsRoutes);
app.route("/", etaxRoutes);
app.route("/", mcpRoutes);

// OpenAPI ドキュメントの公開。全ルートの登録が済んだ後に載せる
// （ドキュメントは集約済みレジストリから生成する）。/api/* の認証
// ミドルウェアの対象外パスに置き、スペック自体は公開情報として返す。
app.get(OPENAPI_DOCUMENT_PATH, createOpenApiDocumentHandler(app));

// 画面（React のビルド成果物）を API と同一ポートで配信する。
// API ルートより後に登録するので、/api/* は上のルートが先に処理する。
// 画面の配信元。既定はソース配置（packages/web/dist）。
// デスクトップ同梱時は ETAX_WEB_ROOT で同梱先を指す。
const webDistRoot = process.env.ETAX_WEB_ROOT || join(import.meta.dir, "../../web/dist");
app.use("/*", serveStatic({ root: webDistRoot }));

/**
 * エラーは { error: string } 形式で返す。ユースケースは業務エラー・ストレージ・
 * DB の例外を個別に HTTP へ変換せずに投げ、ここでステータスを決める。
 * DB の例外は SQL 文とバインド値を含むので、応答は固定文言にしてログにだけ残す。
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // JSON として読めないボディでバリデータが投げる文言は、他の不備と同じ文言にそろえる。
    const message = err.message === "Malformed JSON in request body" ? "JSONボディが必要です" : err.message;
    return c.json({ error: message }, err.status);
  }
  if (
    err instanceof InvoiceDocumentError ||
    err instanceof ReconciliationError ||
    err instanceof FilingSubmissionError ||
    err instanceof PdfFormError ||
    err instanceof ReceiptAnalysisError ||
    err instanceof AgentChatError
  ) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof StorageObjectNotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof StorageError) return c.json({ error: err.message }, 503);
  const dbErrorKind = databaseErrorKind(err);
  if (dbErrorKind !== null) {
    console.error(`DB エラー (${c.req.method} ${c.req.path}):`, err);
    return dbErrorKind === "input"
      ? c.json({ error: databaseInputErrorMessage }, 400)
      : c.json({ error: databaseFailureMessage }, 503);
  }
  console.error(`未処理のエラー (${c.req.method} ${c.req.path}):`, err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// 未マッチ: /api/* は JSON の 404、それ以外の GET は画面の index.html
// （SPA フォールバック。dist が無い環境では JSON 404 のまま）。
app.notFound(async (c) => {
  if (!c.req.path.startsWith("/api/") && c.req.method === "GET") {
    const indexFile = Bun.file(join(webDistRoot, "index.html"));
    if (await indexFile.exists()) {
      return c.body(await indexFile.arrayBuffer(), 200, {
        "Content-Type": "text/html; charset=utf-8",
      });
    }
  }
  return c.json({ error: "not found" }, 404);
});

const port = Number(process.env.PORT ?? 3001);
console.log(`eTaxAgent server listening on http://localhost:${port}`);

// 暗号化ガード: SaaS 運用（認証必須）では機微項目（マイナンバー・TOTP 秘密）を
// 平文で保存しないため、鍵が無ければ起動を止める。単一ユーザーのローカル運用は
// 鍵なしでも動かせるよう、警告に留める。
if (!encryptionEnabled()) {
  if (authRequired()) {
    console.error(
      "ETAX_AUTH_MODE=required では ETAX_ENCRYPTION_KEY が必須です（機微項目を平文保存しないため）。起動を中止します。",
    );
    process.exit(1);
  }
  console.warn(
    "ETAX_ENCRYPTION_KEY が未設定のため、機微項目（マイナンバー・TOTP秘密）は平文で保存されます。公開運用では必ず設定してください。",
  );
}

// 起動時に帳簿DB（PostgreSQL）のテーブルを自己修復しておく。
// コンテナ構成では DB の起動完了がアプリより遅れることがあるため、
// しばらくリトライする。最終的に失敗してもサーバー自体は起動を続け、
// DB必須の処理だけが 503 になる。
void (async () => {
  const maxAttempts = 15;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureTables();
      console.log("帳簿DBのテーブルを確認しました");
      const knowledgeCount = await seedTaxKnowledge();
      console.log(`税務知識ベースを準備しました（${knowledgeCount}件）`);
      // 期限切れセッション/トークンの掃除（起動時＋1時間ごと）。
      const db = getDb();
      if (db) {
        await deleteExpiredAuthRows(db).catch(() => 0);
        const timer = setInterval(() => {
          void deleteExpiredAuthRows(db).catch(() => 0);
        }, 60 * 60 * 1000);
        timer.unref();
      }
      return;
    } catch (e) {
      if (attempt === maxAttempts) {
        console.warn(
          `帳簿DBのテーブル確認に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
})();

// SystemOne の判定モデル（Ollama）はアイドルが続くとアンロードされ、
// 初回の科目判定がコールドスタートで遅くなる。起動時に一度ダミー判定を
// 投げてモデルを読み込ませておく。失敗しても起動は続行する
// （判定自体は履歴→ルールへフォールバックする）。
// その前に、設定画面で保存された接続設定を読み込んでおく。
void (async () => {
  try {
    await loadSystemOneSettings();
    await loadJevPromptOverride();
    await loadRegexRulesOverride();
  } catch (e) {
    console.warn(
      `SystemOne の保存済み設定の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    const systemOne = createSystemOneClient(loadSystemOneConfig());
    await systemOne.judgeAccount("コーヒー 打ち合わせ", ACCOUNT_CRITERIA);
    console.log("SystemOne の判定モデルをウォームアップしました");
  } catch (e) {
    console.warn(
      `SystemOne のウォームアップに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
})();

export default {
  port,
  fetch: app.fetch,
  // エージェント対話・科目判定・接続テストは外部 LLM を何度も呼び、応答を
  // 書き始めるまで 10 秒（Bun の既定）を超えることがある。Bun の上限まで延ばす。
  idleTimeout: 255,
};
