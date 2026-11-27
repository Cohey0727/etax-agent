/**
 * native のモジュールを bun で読み込むための差し替え（端末の保存領域・ファイル）。
 * テストファイル間で同じ差し替えを共有するため、各テストはこのモジュールを最初に import する。
 */
import { mock } from "bun:test";

export const secureStore = new Map<string, string>();
export const asyncStorage = new Map<string, string>();
/** File(uri).bytes() が返すバイト列（uri ごと）。 */
export const localFiles = new Map<string, Uint8Array>();

mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
}));

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => asyncStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      asyncStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      asyncStorage.delete(key);
    },
  },
}));

mock.module("expo-file-system", () => ({
  File: class {
    constructor(readonly uri: string) {}
    async bytes(): Promise<Uint8Array> {
      return localFiles.get(this.uri) ?? new Uint8Array();
    }
  },
  Paths: { cache: "cache" },
}));

mock.module("expo-sharing", () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => undefined,
}));

/** fetch の呼び出し記録。 */
export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch を差し替え、呼び出しを記録する。handler が応答を決める。 */
export function stubFetch(handler: (call: FetchCall) => Promise<Response> | Response): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
