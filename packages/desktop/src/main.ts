/**
 * main.ts — eTaxAgent デスクトップ（Electron）のメインプロセス。
 *
 * 役割:
 *   1. サーバー（Bun バンドル）を子プロセスとして起動する。
 *      データは userData 配下（ETAX_DATA_DIR）に置き、画面の静的ファイルは
 *      同梱した web（ETAX_WEB_ROOT）を指す。サーバーの実行系は Docker と
 *      同じ Bun に統一し、Electron の Node へ移植しない（ネイティブモジュール
 *      better-sqlite3 の ABI 問題もこれで消える）。
 *   2. 空きポートを選び、health が返るまで待ってからウィンドウを開く。
 *   3. 終了時に子プロセスを止める。
 *
 * 追加設定（AGENT_API_KEY など）は userData 直下の etax.env（KEY=VALUE）に
 * 置けば読み込む。自動化ブラウザ（第2ウィンドウ＋CDP）は Phase 3 で足す。
 */
import { app, BrowserWindow, dialog } from "electron";
import { ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

// userData の置き場を製品名に固定する（既定では package.json の name 由来に
// なってしまうため）。データフォルダや etax.env はこの直下に置く。
app.setPath("userData", join(app.getPath("appData"), "eTaxAgent"));

interface AppPaths {
  bunPath: string;
  serverEntry: string;
  webRoot: string;
}

/** 同梱リソース（パッケージ時）／開発時パスの解決。 */
function resolvePaths(): AppPaths {
  if (app.isPackaged) {
    const resources = process.resourcesPath;
    return {
      bunPath: join(resources, "bun", "bun"),
      serverEntry: join(resources, "server", "server.mjs"),
      webRoot: join(resources, "web"),
    };
  }
  const packageRoot = join(import.meta.dirname, "..");
  return {
    bunPath: "bun",
    serverEntry: join(packageRoot, "server-bundle", "server.mjs"),
    webRoot: join(packageRoot, "web"),
  };
}

/** userData/etax.env（KEY=VALUE、# はコメント）を読む。無ければ空。 */
function readUserEnv(userDataDir: string): Record<string, string> {
  const path = join(userDataDir, "etax.env");
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/** OS に空きポートを1つ選ばせる。 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** サーバー子プロセスを起動し、health が返るまで待つ。 */
async function startServer(paths: AppPaths): Promise<{ child: ChildProcess; port: number }> {
  const userDataDir = app.getPath("userData");
  const dataDir = join(userDataDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const port = await findFreePort();
  const env = {
    ...process.env,
    PORT: String(port),
    ETAX_DATA_DIR: dataDir,
    ETAX_WEB_ROOT: paths.webRoot,
    SYSTEMONE_BASE_URL: "http://127.0.0.1:11434",
    SYSTEMONE_MODEL: "tev1",
    AGENT_SCHEMA: "openai",
    AGENT_BASE_URL: "https://opencode.ai/zen/go/v1",
    AGENT_MODEL: "glm-5.2",
    ...readUserEnv(userDataDir),
  };
  const child = spawn(paths.bunPath, [paths.serverEntry], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (data) => process.stdout.write(`[server] ${data}`));
  child.stderr?.on("data", (data) => process.stderr.write(`[server] ${data}`));
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return { child, port };
    } catch {
      // 起動途中は接続できないのが通常。締切まで待つ。
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("サーバーの起動がタイムアウトしました");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

let serverChild: ChildProcess | null = null;

app.whenReady().then(async () => {
  try {
    const started = await startServer(resolvePaths());
    serverChild = started.child;
    const window = new BrowserWindow({
      width: 1320,
      height: 880,
      title: "eTaxAgent",
    });
    await window.loadURL(`http://127.0.0.1:${started.port}/`);
  } catch (e) {
    dialog.showErrorBox(
      "eTaxAgent",
      e instanceof Error ? e.message : String(e),
    );
    app.quit();
  }
});

app.on("before-quit", () => {
  serverChild?.kill("SIGTERM");
});

app.on("window-all-closed", () => {
  app.quit();
});
