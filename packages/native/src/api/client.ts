/**
 * client.ts — サーバーAPIの共通呼び出し。認証はセッショントークンを
 * Authorization: Bearer で送る（session.ts）。エラーはサーバーの
 * error 文言を持つ ApiError として投げる。
 */
import { API_URL } from "../config";
import { currentSessionToken } from "./session";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** JSON でない生ボディ（CSV・ファイルのバイト列など）。 */
  rawBody?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
  /** 認証ヘッダを付けない（ログイン前の公開API用）。 */
  anonymous?: boolean;
}

async function buildHeaders(options: RequestOptions): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined || options.contentType) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  if (!options.anonymous) {
    const token = currentSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** 生の Response を返す低レベル呼び出し（二進データの取得用）。 */
export async function apiRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = await buildHeaders(options);
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined || options.rawBody ? "POST" : "GET"),
      headers,
      body:
        options.rawBody ??
        (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(0, "ネットワークに接続できませんでした");
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
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, "ネットワークに接続できませんでした");
  }
}

/**
 * サーバーが返したURLを絶対URLへ解決する。ストレージが同一オリジン配信の
 * ときは相対パスで返るため、API のオリジンを補う。絶対URLはそのまま返す。
 */
export function absoluteApiUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}
