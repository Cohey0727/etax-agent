/**
 * db.ts — Drizzle + postgres.js の遅延初期化（lib: 共通インスタンス）。
 *
 * import 時点では接続しない。DATABASE_URL が未設定でも
 * サーバーは起動し、DB不要のエンドポイント（health / calc / 取込プレビュー等）は
 * そのまま動く。DB が必要な処理は getDb() が null のとき 503 を返す。
 */
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../repositories/schema";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: Db | null = null;
let attempted = false;

/** DATABASE_URL が設定されているか。 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** DBインスタンスを返す。未設定なら null（接続はここで初めて張る）。 */
export function getDb(): Db | null {
  if (!process.env.DATABASE_URL) return null;
  if (!cached) {
    const client = postgres(process.env.DATABASE_URL, { max: 5, connect_timeout: 5 });
    cached = drizzle(client, { schema });
    attempted = true;
  }
  return cached;
}

/** DB接続を試みたことがあるか。 */
export function dbWasAttempted(): boolean {
  return attempted;
}
