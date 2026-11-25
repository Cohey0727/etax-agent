/**
 * index.ts — eTaxAgent サーバー（Hono / Bun）のエントリーポイント。
 *
 * 構成（CODING_CONVENTIONS_BACKEND 準拠）:
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
 *   ALL    /mcp                     MCP（外部エージェント連携。認証はユーザーごとの
 *                                   APIトークン（設定画面で発行、Bearer）。認証フロー
 *                                   自体は対象外でトークンが代替する。MCP_TOKEN は
 *                                   従来互換のマスタートークン）
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
import { publicBaseUrl } from "./lib/publicUrl";
import { billingEnabled } from "./gateways/stripeGateway";
import { hasActivePlan } from "./repositories/subscriptionRepository";
import { authRequired, runWithTenant } from "./lib/tenantContext";
import { resolveRequestUserId } from "./usecases/authSession";
import { seedTaxKnowledge } from "./services/knowledge/seedTaxKnowledge";
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

const app = new OpenAPIHono();

/**
 * CORS はワイルドカードにせず、許可オリジンを設定ベースにする（Issue #7）。
 * 画面は同一オリジン配信が前提なので、通常は CORS 自体が不要。許可するのは
 * 公開オリジン（ETAX_PUBLIC_URL）と ETAX_CORS_ORIGINS（カンマ区切り）だけで、
 * 認証オフのローカル運用に限って localhost の開発オリジンも許可する。
 * セッション Cookie を使うため credentials は true（ワイルドカードとは併用不可）。
 */
function allowedCorsOrigins(): string[] {
  const fromEnv = (process.env.ETAX_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  const publicUrl = publicBaseUrl();
  return publicUrl ? [...fromEnv, publicUrl] : fromEnv;
}

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (allowedCorsOrigins().includes(origin)) return origin;
      if (!authRequired() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return origin;
      }
      return undefined;
    },
    credentials: true,
  }),
);

// リクエストボディの上限（巨大ボディでのメモリ枯渇を防ぐ、Issue #7）。
// CSV 取込・領収書画像の PUT もこの範囲に収まる大きさにしている。
app.use("/api/*", bodyLimit({ maxSize: 25 * 1024 * 1024 }));

// 起動時初期化（テーブル自己修復）はバックグラウンドで進むため、
// DB を使う初回リクエストが初期化完了前に走ると失敗する（Issue #11）。
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
  const userId = db ? await resolveRequestUserId(db, c) : undefined;
  if (userId === undefined) {
    if (authRequired() && !isPublic) {
      return c.json({ message: "ログインが必要です" }, 401);
    }
    return next();
  }
  return runWithTenant(userId, () => next());
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
    { message: "この機能は有料プラン（月額490円）への加入が必要です" },
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

// 画面（React のビルド成果物）を API と同一ポートで配信する。
// API ルートより後に登録するので、/api/* は上のルートが先に処理する。
// 画面の配信元。既定はソース配置（packages/web/dist）。
// デスクトップ同梱時は ETAX_WEB_ROOT で同梱先を指す。
const webDistRoot = process.env.ETAX_WEB_ROOT || join(import.meta.dir, "../../web/dist");
app.use("/*", serveStatic({ root: webDistRoot }));

// エラーは従来どおり { error: string } 形式で返す（HTTPException の文言をそのまま使う）。
// バリデータが投げる「Malformed JSON」は従来文言（JSONボディが必要です）に読み替える。
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const message = err.message === "Malformed JSON in request body" ? "JSONボディが必要です" : err.message;
    return c.json({ error: message }, err.status);
  }
  // 想定外の 500 は握り潰さず、原因追跡のために必ずログへ残す（Issue #11）。
  console.error(`未処理のエラー (${c.req.method} ${c.req.path}):`, err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// 未マッチ: /api/* は従来どおり JSON 404、それ以外の GET は画面の index.html
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

// 暗号化ガード（Issue #7）: SaaS 運用（認証必須）では機微項目
// （マイナンバー・TOTP 秘密）を平文で保存しないため、鍵が無ければ
// 起動を止める。単一ユーザーのローカル運用では従来互換のため警告に留める。
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
      // 期限切れセッション/トークンの掃除（起動時＋1時間ごと。Issue #11）。
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
};
