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
 *   ALL    /mcp                     MCP（外部エージェント連携。MCP_TOKEN 設定時は Bearer 認証）
 *
 * DB はデータフォルダ内の SQLite ファイルで、起動時にテーブルを自己修復する。
 * 起動時は packages/web のビルド成果物（dist）も同一ポートで配信する
 * （React は静的ファイルなので、公開するポートはこの1つで足りる）。
 * 最終提出（e-Tax）は本サーバーでは行わない（納税者本人の操作）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { join } from "node:path";
import { ACCOUNT_CRITERIA } from "@etax/shared";
import { ensureTables, isDatabaseConfigured } from "./lib/db";
import { seedTaxKnowledge } from "./services/knowledge/seedTaxKnowledge";
import { createSystemOneClient } from "./gateways/systemOneGateway";
import { loadSystemOneConfig } from "./lib/config";
import agentRoutes from "./routes/agent";
import calcRoutes from "./routes/calc";
import classifyRoutes from "./routes/classify";
import etaxRoutes from "./routes/etax";
import filesRoutes from "./routes/files";
import filingSnapshotsRoutes from "./routes/filingSnapshots";
import filingStatusRoutes from "./routes/filingStatus";
import freeeRoutes from "./routes/freee";
import healthRoutes from "./routes/health";
import importsRoutes from "./routes/imports";
import mcpRoutes from "./routes/mcp";
import receiptsRoutes from "./routes/receipts";
import taxpayerRoutes from "./routes/taxpayer";
import transactionsRoutes from "./routes/transactions";

const app = new OpenAPIHono();
app.use("/api/*", cors());

app.route("/", healthRoutes);
app.route("/", calcRoutes);
app.route("/", transactionsRoutes);
app.route("/", importsRoutes);
app.route("/", agentRoutes);
app.route("/", classifyRoutes);
app.route("/", receiptsRoutes);
app.route("/", filesRoutes);
app.route("/", freeeRoutes);
app.route("/", filingStatusRoutes);
app.route("/", filingSnapshotsRoutes);
app.route("/", taxpayerRoutes);
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

// 起動時に帳簿DB（SQLite）のテーブルを自己修復しておく。
// 失敗してもサーバー自体は起動を続け、DB必須の処理だけが 503 になる。
void (async () => {
  try {
    await ensureTables();
    console.log("帳簿DBのテーブルを確認しました");
    const knowledgeCount = await seedTaxKnowledge();
    console.log(`税務知識ベースを準備しました（${knowledgeCount}件）`);
  } catch (e) {
    console.warn(
      `帳簿DBのテーブル確認に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
})();

// SystemOne の判定モデル（Ollama）はアイドルが続くとアンロードされ、
// 初回の科目判定がコールドスタートで遅くなる。起動時に一度ダミー判定を
// 投げてモデルを読み込ませておく。失敗しても起動は続行する
// （判定自体は履歴→ルールへフォールバックする）。
void (async () => {
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
