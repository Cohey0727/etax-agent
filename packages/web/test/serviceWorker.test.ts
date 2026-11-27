/**
 * serviceWorker.test.ts — サービスワーカー（public/sw.js）の画面のキャッシュの検証。
 *
 * 担保すること:
 * - アプリの画面の正常な応答は、オフライン用のトップ（"/"）として控える
 * - エラー応答や LP（/lp.html）は "/" に控えない（オフラインで起動したときにアプリが出なくなる）
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf-8");

type FetchListener = (event: { request: Request; respondWith: (r: Promise<Response>) => void }) => void;

/** sw.js を偽のサービスワーカー環境で読み込み、ナビゲーションを1回流して "/" に控えた内容を返す。 */
const navigate = async (path: string, response: Response): Promise<string | null> => {
  let fetchListener: FetchListener | null = null;
  const stored = new Map<string, Response>();
  const cache = {
    put: async (key: string, value: Response) => {
      stored.set(key, value);
    },
    addAll: async () => undefined,
  };
  const fakeSelf = {
    location: { origin: "https://app.example" },
    addEventListener: (type: string, listener: FetchListener) => {
      if (type === "fetch") fetchListener = listener;
    },
  };
  const fakeCaches = {
    open: async () => cache,
    match: async (key: string) => stored.get(key),
    keys: async () => [],
  };
  new Function("self", "caches", "fetch", source)(fakeSelf, fakeCaches, async () => response);
  const request = { method: "GET", url: `https://app.example${path}`, mode: "navigate" } as Request;
  let responded: Promise<Response> | null = null;
  (fetchListener as FetchListener | null)?.({ request, respondWith: (r) => (responded = r) });
  await responded;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = stored.get("/");
  return saved ? saved.text() : null;
};

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html" } });

describe("sw.js のナビゲーション", () => {
  test("アプリの画面の正常な応答はトップとして控える", async () => {
    expect(await navigate("/accounts/2026/dashboard", html("<app>"))).toBe("<app>");
  });

  test("エラー応答はトップとして控えない", async () => {
    expect(await navigate("/accounts/2026/dashboard", html("Bad Gateway", 502))).toBeNull();
  });

  test("LP はトップとして控えない", async () => {
    expect(await navigate("/lp.html", html("<lp>"))).toBeNull();
  });
});
