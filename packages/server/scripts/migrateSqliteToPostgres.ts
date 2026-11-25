/**
 * migrateSqliteToPostgres.ts — 旧 SQLite DB から PostgreSQL への一回限りの
 * データ移行スクリプト（scripts）。
 *
 * 使い方:
 *   DATABASE_URL=postgres://etax:etax@db:5432/etaxagent \
 *     bun run scripts/migrateSqliteToPostgres.ts [SQLiteファイルのパス]
 *
 * - SQLiteファイルの既定は packages/server/data/etax.db。
 * - 移行先は空であること（対象テーブルに1行でもあれば中止する）。
 * - 全テーブルの行数を移行前後で突合し、取引は金額合計も照合する。
 * - 日時列（SQLite ではミリ秒整数）を Date へ、JSON 列（同・文字列）を
 *   オブジェクトへ変換してから投入する。暗号化列（enc:v1: 形式）は
 *   文字列のまま移し、ETAX_ENCRYPTION_KEY があれば復号できることだけ
 *   検証する（値は出力しない）。
 * - 投入は1トランザクションで行い、失敗したら移行先は空のまま残る。
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/node-postgres";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { applySchema } from "../src/lib/db";
import { decryptField } from "../src/lib/encryption";
import * as schema from "../src/repositories/schema";

/** 移行対象テーブル（外部キーの依存順）。 */
const tables = [
  "users",
  "imports",
  "transactions",
  "transaction_history",
  "receipts",
  "sessions",
  "api_keys",
  "email_verification_tokens",
  "magic_link_tokens",
  "user_identities",
  "filing_status",
  "taxpayer_profiles",
  "filing_snapshots",
  "fixed_assets",
  "subscriptions",
  "stripe_webhook_events",
  "filing_inputs",
  "knowledge_docs",
] as const;

/** ミリ秒整数 → Date に変換する列（テーブルごと）。 */
const timestampColumns: Record<string, string[]> = {
  imports: ["created_at"],
  transactions: ["created_at", "updated_at", "deleted_at"],
  transaction_history: ["created_at"],
  filing_status: ["confirmed_at", "calculated_at", "submitted_at", "updated_at"],
  taxpayer_profiles: ["updated_at"],
  filing_snapshots: ["confirmed_at"],
  fixed_assets: ["created_at", "updated_at"],
  receipts: ["created_at", "updated_at"],
  subscriptions: ["current_period_end", "last_event_created_at", "updated_at"],
  filing_inputs: ["updated_at"],
  users: ["created_at"],
  sessions: ["expires_at", "created_at"],
  api_keys: ["last_used_at", "created_at"],
  email_verification_tokens: ["expires_at", "used_at", "created_at"],
  magic_link_tokens: ["expires_at", "used_at", "created_at"],
  user_identities: ["created_at"],
  stripe_webhook_events: ["created_at"],
  knowledge_docs: ["updated_at"],
};

/** SQLite の 0/1 整数 → boolean に変換する列（テーブルごと）。 */
const booleanColumns: Record<string, string[]> = {
  users: ["totp_enabled", "email_verified"],
};

/** JSON 文字列 → オブジェクトに変換する列（テーブルごと）。 */
const jsonColumns: Record<string, string[]> = {
  imports: ["mapping"],
  transaction_history: ["before", "after"],
  filing_snapshots: ["figures"],
  receipts: ["extracted"],
};

/** ID 列（IDENTITY）を持つテーブル。移行後にシーケンスを進める。 */
const identityTables = new Set([
  "users",
  "imports",
  "transactions",
  "transaction_history",
  "receipts",
  "sessions",
  "api_keys",
  "email_verification_tokens",
  "magic_link_tokens",
  "user_identities",
  "filing_snapshots",
  "fixed_assets",
  "subscriptions",
  "stripe_webhook_events",
  "knowledge_docs",
]);

type SqliteRow = Record<string, unknown>;

function convertValue(table: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (booleanColumns[table]?.includes(column)) {
    // SQLite は真偽値を 0/1 整数で持つ。PostgreSQL の boolean へ変換する。
    return value === 1 || value === true;
  }
  if (timestampColumns[table]?.includes(column)) {
    return new Date(Number(value));
  }
  if (jsonColumns[table]?.includes(column)) {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
  return value;
}

async function main(): Promise<void> {
  const sqlitePath =
    process.argv[2] ?? join(import.meta.dir, "../data/etax.db");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が必要です（移行先 PostgreSQL の接続文字列）");
  }
  if (!existsSync(sqlitePath)) {
    throw new Error(`SQLiteファイルが見つかりません: ${sqlitePath}`);
  }
  console.log(`移行元: ${sqlitePath}`);

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  await applySchema(db);
  const client = await pool.connect();

  try {
    // 移行先が空であることを確認する（誤って実データへ重ねない）。
    for (const table of tables) {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      if (Number(rows[0].count) > 0) {
        throw new Error(
          `移行先の ${table} に既に ${rows[0].count} 行あります。中止します（移行先は空のDBを指定してください）`,
        );
      }
    }

    const sourceCounts = new Map<string, number>();
    await client.query("BEGIN");
    for (const table of tables) {
      const sourceColumns = (
        sqlite.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all()
      ).map((c) => c.name);
      if (sourceColumns.length === 0) {
        sourceCounts.set(table, 0);
        console.log(`${table}: 移行元にテーブルなし（0行）`);
        continue;
      }
      const { rows: targetColumnRows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const targetColumns = new Set(targetColumnRows.map((r) => r.column_name));
      const columns = sourceColumns.filter((c) => targetColumns.has(c));
      const rows = sqlite
        .query<SqliteRow, []>(`SELECT ${columns.join(", ")} FROM ${table}`)
        .all();
      sourceCounts.set(table, rows.length);

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const params: unknown[] = [];
        const valueGroups = chunk.map((row) => {
          const placeholders = columns.map((column) => {
            const value = convertValue(table, column, row[column]);
            params.push(
              jsonColumns[table]?.includes(column) && value !== null
                ? JSON.stringify(value)
                : value,
            );
            return `$${params.length}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await client.query(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")}`,
          params,
        );
      }
      if (identityTables.has(table) && rows.length > 0) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT MAX(id) FROM ${table}))`,
        );
      }
      console.log(`${table}: ${rows.length} 行を投入`);
    }
    await client.query("COMMIT");

    // 突合: テーブル別件数。
    let ok = true;
    console.log("\n--- 件数突合（移行元 → 移行先） ---");
    for (const table of tables) {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      const target = Number(rows[0].count);
      const source = sourceCounts.get(table) ?? 0;
      const mark = target === source ? "OK" : "不一致";
      if (target !== source) ok = false;
      console.log(`${table}: ${source} → ${target} [${mark}]`);
    }
    // 突合: 取引の金額合計。
    const sourceSum = sqlite
      .query<{ total: number }, []>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions",
      )
      .get()?.total;
    const { rows: sumRows } = await client.query<{ total: string }>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions",
    );
    const targetSum = Number(sumRows[0].total);
    const sumOk = sourceSum === targetSum;
    if (!sumOk) ok = false;
    console.log(
      `transactions 金額合計: ${sourceSum} → ${targetSum} [${sumOk ? "OK" : "不一致"}]`,
    );

    // 暗号化列の復号確認（値は出力しない）。
    const { rows: encRows } = await client.query<{ my_number: string }>(
      "SELECT my_number FROM taxpayer_profiles WHERE my_number LIKE 'enc:v1:%'",
    );
    if (encRows.length > 0) {
      if (!process.env.ETAX_ENCRYPTION_KEY) {
        console.log(
          `暗号化された個人番号が ${encRows.length} 件ありますが ETAX_ENCRYPTION_KEY 未設定のため復号確認を省略しました`,
        );
      } else {
        for (const row of encRows) decryptField(row.my_number);
        console.log(`暗号化された個人番号 ${encRows.length} 件の復号を確認しました`);
      }
    }

    if (!ok) {
      throw new Error("突合で不一致がありました。移行先を確認してください");
    }
    console.log("\n移行完了: すべての突合が一致しました");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((e) => {
  console.error(`移行に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
