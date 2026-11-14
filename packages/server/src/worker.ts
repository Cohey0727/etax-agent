/**
 * worker.ts — Cloudflare Workers 用エントリーポイント。
 *
 * /api/* は Hono アプリ（src/index.ts の fetch）へ、それ以外は
 * 静的アセット（packages/web のビルド成果物、wrangler.toml の ASSETS）へ回す。
 * Bun 用の起動（src/index.ts を直接実行）と共存させるための薄い入口で、
 * アプリ本体・計算ロジックには触らない。
 *
 * 環境変数は Workers の vars / secrets から process.env 経由で読む
 * （compatibility_flags の nodejs_compat が前提）。
 * DATABASE_URL を設定しなければ DB 系エンドポイントは従来どおり 503 を返し、
 * 計算系エンドポイントと画面はそのまま動く。
 */
import server from "./index";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: AssetsBinding;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return server.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
