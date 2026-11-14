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
 *   PUT    /api/transactions/{id}   取引更新（DB）
 *   DELETE /api/transactions/{id}   取引削除（DB）
 *   GET    /api/imports             取込履歴（DB）
 *   POST   /api/import/csv          CSV取込（AI/ヒューリスティクス自動マッピング）
 *   POST   /api/agent/chat          対話エージェント（要 AGENT_API_KEY）
 *
 * DATABASE_URL 未設定でも起動し、DB不要のエンドポイントはそのまま動く。
 * Bun で起動した場合は packages/web のビルド成果物（dist）も同一ポートで配信する
 * （React は静的ファイルなので、公開するポートはこの1つで足りる）。
 * Cloudflare Workers では worker.ts が ASSETS バインディングで配信する。
 * 最終提出（e-Tax）は本サーバーでは行わない（納税者本人の操作）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { join } from "node:path";
import agentRoutes from "./routes/agent";
import calcRoutes from "./routes/calc";
import healthRoutes from "./routes/health";
import importsRoutes from "./routes/imports";
import transactionsRoutes from "./routes/transactions";

const app = new OpenAPIHono();
app.use("/api/*", cors());

app.route("/", healthRoutes);
app.route("/", calcRoutes);
app.route("/", transactionsRoutes);
app.route("/", importsRoutes);
app.route("/", agentRoutes);

// 画面（React のビルド成果物）を API と同一ポートで配信する。
// API ルートより後に登録するので、/api/* は上のルートが先に処理する。
const webDistRoot = join(import.meta.dir, "../../web/dist");
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

export default {
  port,
  fetch: app.fetch,
};
