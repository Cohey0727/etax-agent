/**
 * testDb.ts — テスト用 PostgreSQL の接続ヘルパー。
 *
 * TEST_DATABASE_URL（既定: postgres://etax:etax@127.0.0.1:5432/etaxagent_test）
 * が指す専用テストDBに、本番と同じ DDL（applySchema）で全テーブルを用意する。
 * createTestDb の呼び出しごとに全テーブルを空にして返すため、各テストは
 * 空の DB から始められる（旧インメモリ SQLite の置き換え）。
 * テストDBは使い捨て前提で、実データのDBを指してはいけない。
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { applySchema, Db } from "../src/lib/db";
import * as schema from "../src/repositories/schema";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";

/** TRUNCATE 対象（全テーブル）。 */
const allTables = [
  "transaction_history",
  "receipts",
  "transactions",
  "imports",
  "sessions",
  "api_keys",
  "magic_link_tokens",
  "user_identities",
  "users",
  "filing_status",
  "taxpayer_profiles",
  "filing_snapshots",
  "filing_inputs",
  "fixed_assets",
  "subscriptions",
  "knowledge_docs",
];

let shared: Db | null = null;

/** テスト用 DB を返す。初回はスキーマを用意し、2回目以降は全テーブルを空にする。 */
export async function createTestDb(): Promise<Db> {
  if (!shared) {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    shared = drizzle(pool, { schema });
    await applySchema(shared);
    return shared;
  }
  await shared.execute(
    sql.raw(`TRUNCATE ${allTables.join(", ")} RESTART IDENTITY CASCADE`),
  );
  return shared;
}
