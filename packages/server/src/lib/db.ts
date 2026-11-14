/**
 * db.ts — Drizzle + postgres.js の遅延初期化（lib: 共通インスタンス）。
 *
 * import 時点では接続しない。DATABASE_URL が未設定でも
 * サーバーは起動し、DB不要のエンドポイント（health / calc / 取込プレビュー等）は
 * そのまま動く。DB が必要な処理は getDb() が null のとき 503 を返す。
 */
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
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

let tablesEnsured = false;

/**
 * テーブルが無ければ作る（冪等）。drizzle-kit のマイグレーションを持ち込まず、
 * 起動時にスキーマを自己修復するための最小DDL（schema.ts と一致させる）。
 * DATABASE_URL 未設定なら何もしない。
 */
export async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = getDb();
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS imports (
      id serial PRIMARY KEY,
      filename text,
      source_name text,
      mapping jsonb,
      row_count integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id serial PRIMARY KEY,
      date varchar(10) NOT NULL,
      description text NOT NULL DEFAULT '',
      amount integer NOT NULL,
      account text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT '未分類',
      income_type text NOT NULL DEFAULT 'other',
      import_id integer REFERENCES imports(id),
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS filing_status (
      year integer PRIMARY KEY,
      confirmed_at timestamp,
      calculated_at timestamp,
      submitted_at timestamp,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  tablesEnsured = true;
}
