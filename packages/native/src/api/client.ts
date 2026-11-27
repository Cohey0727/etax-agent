/**
 * client.ts — サーバーAPIの共通呼び出し。認証はセッショントークンを
 * Authorization: Bearer で送る（session.ts）。エラーはサーバーの
 * error 文言を持つ ApiError として投げる。
 */
import { API_URL } from "../config";
import { clearSessionToken, currentSessionToken } from "./session";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * 応答を待つ上限（ミリ秒）。Android の fetch は既定で期限が無く、応答しない
 * サーバーを無期限に待つため、すべての呼び出しに期限を付ける。
 */
const DEFAULT_TIMEOUT_MS = 30_000;
/** AI の判定・解析やファイルの送受信など、時間のかかる呼び出しの期限。 */
export const LONG_TIMEOUT_MS = 180_000;

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** JSON でない生ボディ（CSV・ファイルのバイト列など）。 */
  rawBody?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
  /** 認証ヘッダを付けない（ログイン前の公開API用）。 */
  anonymous?: boolean;
  /** 応答を待つ上限（ミリ秒）。既定は 30 秒。 */
  timeoutMs?: number;
}

/** 期限つきの fetch。通信できない・期限切れはどちらも ApiError(0) にする。 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(
      0,
      controller.signal.aborted
        ? "サーバーからの応答がありませんでした"
        : "ネットワークに接続できませんでした",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** 生の Response を返す低レベル呼び出し（二進データの取得用）。 */
export async function apiRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined || options.contentType) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  const token = options.anonymous ? null : currentSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetchWithTimeout(
    `${API_URL}${path}`,
    {
      method: options.method ?? (options.body !== undefined || options.rawBody ? "POST" : "GET"),
      headers,
      body:
        options.rawBody ??
        (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  // 送ったトークンが拒否されたらセッションは失効している。購読者（AuthContext）へ
  // 知らせてログイン画面へ戻す。待つ間に別のトークンへ替わっていたら消さない。
  if (resp.status === 401 && token && currentSessionToken() === token) {
    await clearSessionToken();
  }
  return resp;
}

async function parseJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new ApiError(resp.status, data.error ?? `HTTP ${resp.status}`);
  }
  return data;
}

/** JSON を返すAPI呼び出し。失敗時は ApiError。 */
export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const resp = await apiRaw(path, options);
  return parseJson<T>(resp);
}

/**
 * 失敗時に null を返すAPI呼び出し（DB未接続などで「取得できない」ことが
 * 正常系に含まれる取得系API用）。
 */
export async function apiJsonOrNull<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  try {
    const resp = await apiRaw(path, options);
    if (!resp.ok) return null;
    return (await resp.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** 絶対URLへの生リクエスト（署名付きアップロードURLなど、API外の宛先用）。 */
export async function rawFetch(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: BodyInit },
): Promise<Response> {
  return fetchWithTimeout(url, init, LONG_TIMEOUT_MS);
}

/**
 * サーバーが返したURLを絶対URLへ解決する。ストレージが同一オリジン配信の
 * ときは相対パスで返るため、API のオリジンを補う。絶対URLはそのまま返す。
 */
export function absoluteApiUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}
