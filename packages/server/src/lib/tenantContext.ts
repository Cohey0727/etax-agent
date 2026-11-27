/**
 * tenantContext.ts — リクエスト単位のテナント（ログインユーザー）文脈（lib）。
 *
 * 認証ミドルウェアがセッション/APIキーから解決したユーザーIDを
 * AsyncLocalStorage に載せ、リポジトリ層が所有者フィルタと所有者スタンプに
 * 使う。文脈が無い場合（認証オフのローカル運用）は単一テナントとして
 * 振る舞い、所有者は既定ユーザー（id=1）として扱う。
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  userId: number;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** 既定の所有者（認証オフ運用で書いたデータ・所有者を指定せずに入った行の所有者）。 */
export const DEFAULT_OWNER_ID = 1;

/** テナント文脈の中で処理を実行する（認証ミドルウェアから呼ぶ）。 */
export function runWithTenant<T>(userId: number, fn: () => T): T {
  return storage.run({ userId }, fn);
}

/** 現在のテナントのユーザーID。文脈が無ければ undefined（認証オフ）。 */
export function currentUserId(): number | undefined {
  return storage.getStore()?.userId;
}

/** 書き込み時にスタンプする所有者ID（文脈が無ければ既定ユーザー）。 */
export function ownerIdForWrite(): number {
  return currentUserId() ?? DEFAULT_OWNER_ID;
}

/**
 * 認証が必須かどうか（SaaS モード）。
 * ETAX_AUTH_MODE=required のときだけ全 API に認証を要求する。
 * 既定（未設定）はローカルの単一ユーザー運用で、認証を求めない。
 */
export function authRequired(): boolean {
  return process.env.ETAX_AUTH_MODE === "required";
}
