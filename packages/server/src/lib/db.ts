/**
 * db.ts — Drizzle + better-sqlite3（lib: 共通インスタンス）。
 *
 * DB はアプリのデータフォルダ内の SQLite ファイル（既定: <data>/etax.db、
 * ETAX_DB_FILE で上書き可）。同梱アプリ前提のため DB は常時利用可能で、
 * getDb() が null を返すのはファイルを開けなかった場合のみ。
 * import 時点では開かない（初回利用時に遅延オープンする）。
 */
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverDataDir } from "./config";
import * as schema from "../repositories/schema";

export type Db = BetterSQLite3Database<typeof schema>;

let cached: Db | null = null;
let attempted = false;

/** SQLite ファイルのパス。 */
export function databaseFilePath(): string {
  return process.env.ETAX_DB_FILE || join(serverDataDir(), "etax.db");
}

/** DB が利用可能か（ローカルファイルのため通常は常に true）。 */
export function isDatabaseConfigured(): boolean {
  return true;
}

/** DBインスタンスを返す。開けなければ null（接続はここで初めて張る）。 */
export function getDb(): Db | null {
  if (cached) return cached;
  attempted = true;
  try {
    const filePath = databaseFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const client = new Database(filePath);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    cached = drizzle(client, { schema });
    return cached;
  } catch (e) {
    console.warn(
      `帳簿DBを開けませんでした: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** DB接続を試みたことがあるか。 */
export function dbWasAttempted(): boolean {
  return attempted;
}

let tablesEnsured = false;

/**
 * テーブルが無ければ作る（冪等）。drizzle-kit のマイグレーションを持ち込まず、
 * 起動時にスキーマを自己修復するための最小DDL（schema.ts と一致させる）。
 */
export async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = getDb();
  if (!db) return;
  db.run(sql`
    CREATE TABLE IF NOT EXISTS imports (
      id integer PRIMARY KEY AUTOINCREMENT,
      filename text,
      source_name text,
      mapping text,
      row_count integer NOT NULL DEFAULT 0,
      created_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id integer PRIMARY KEY AUTOINCREMENT,
      date text NOT NULL,
      fiscal_year integer NOT NULL DEFAULT 0,
      description text NOT NULL DEFAULT '',
      amount integer NOT NULL,
      account text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT '未分類',
      income_type text NOT NULL DEFAULT 'other',
      tax_category text NOT NULL DEFAULT '',
      import_id integer REFERENCES imports(id),
      created_at integer NOT NULL,
      updated_at integer NOT NULL DEFAULT 0,
      deleted_at integer
    )
  `);
  // 既存DBへの列追加（CREATE TABLE IF NOT EXISTS では既存テーブルに列が増えないため）。
  const txColumns = db.all<{ name: string }>(sql`PRAGMA table_info(transactions)`);
  if (!txColumns.some((c) => c.name === "tax_category")) {
    db.run(sql`ALTER TABLE transactions ADD COLUMN tax_category text NOT NULL DEFAULT ''`);
  }
  if (!txColumns.some((c) => c.name === "fiscal_year")) {
    db.run(sql`ALTER TABLE transactions ADD COLUMN fiscal_year integer NOT NULL DEFAULT 0`);
  }
  if (!txColumns.some((c) => c.name === "updated_at")) {
    db.run(sql`ALTER TABLE transactions ADD COLUMN updated_at integer NOT NULL DEFAULT 0`);
    // 既存行の更新日時は登録日時で埋める。
    db.run(sql`UPDATE transactions SET updated_at = created_at WHERE updated_at = 0`);
  }
  if (!txColumns.some((c) => c.name === "deleted_at")) {
    db.run(sql`ALTER TABLE transactions ADD COLUMN deleted_at integer`);
  }
  db.run(sql`
    CREATE TABLE IF NOT EXISTS transaction_history (
      id integer PRIMARY KEY AUTOINCREMENT,
      transaction_id integer NOT NULL REFERENCES transactions(id),
      action text NOT NULL,
      before text,
      after text,
      created_at integer NOT NULL
    )
  `);
  // 割り当て年度が未設定（0）の行は、日付の年で埋める（冪等）。
  db.run(sql`
    UPDATE transactions
    SET fiscal_year = CAST(substr(date, 1, 4) AS INTEGER)
    WHERE fiscal_year = 0
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS filing_status (
      year integer PRIMARY KEY,
      confirmed_at integer,
      calculated_at integer,
      submitted_at integer,
      updated_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS taxpayer_profiles (
      year integer PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      name_kana text NOT NULL DEFAULT '',
      zip_code text NOT NULL DEFAULT '',
      address text NOT NULL DEFAULT '',
      address_line2 text NOT NULL DEFAULT '',
      birth_date text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      tax_office_name text NOT NULL DEFAULT '',
      tax_office_code text NOT NULL DEFAULT '',
      my_number text NOT NULL DEFAULT '',
      user_id text NOT NULL DEFAULT '',
      occupation text NOT NULL DEFAULT '',
      shop_name text NOT NULL DEFAULT '',
      jan1_address text NOT NULL DEFAULT '',
      invoice_number text NOT NULL DEFAULT '',
      previous_zip_code text NOT NULL DEFAULT '',
      previous_address text NOT NULL DEFAULT '',
      updated_at integer NOT NULL
    )
  `);
  // 既存DBへの列追加（異動申出書用の異動前納税地）。
  const taxpayerColumns = db.all<{ name: string }>(sql`PRAGMA table_info(taxpayer_profiles)`);
  if (!taxpayerColumns.some((c) => c.name === "previous_zip_code")) {
    db.run(sql`ALTER TABLE taxpayer_profiles ADD COLUMN previous_zip_code text NOT NULL DEFAULT ''`);
  }
  if (!taxpayerColumns.some((c) => c.name === "previous_address")) {
    db.run(sql`ALTER TABLE taxpayer_profiles ADD COLUMN previous_address text NOT NULL DEFAULT ''`);
  }
  if (!taxpayerColumns.some((c) => c.name === "user_id")) {
    db.run(sql`ALTER TABLE taxpayer_profiles ADD COLUMN user_id text NOT NULL DEFAULT ''`);
  }
  db.run(sql`
    CREATE TABLE IF NOT EXISTS filing_snapshots (
      id integer PRIMARY KEY AUTOINCREMENT,
      year integer NOT NULL,
      confirmed_at integer NOT NULL,
      figures text NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS fixed_assets (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      quantity text NOT NULL DEFAULT '',
      income_type text NOT NULL DEFAULT 'business',
      acquisition_date text NOT NULL,
      service_start_date text,
      cost integer NOT NULL,
      useful_life_years integer NOT NULL,
      method text NOT NULL DEFAULT 'straight_line',
      business_ratio_percent integer NOT NULL DEFAULT 100,
      disposed_date text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id integer PRIMARY KEY AUTOINCREMENT,
      file_id text NOT NULL UNIQUE,
      mime_type text NOT NULL DEFAULT '',
      extracted text,
      transaction_id integer REFERENCES transactions(id),
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id integer PRIMARY KEY AUTOINCREMENT,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id integer NOT NULL REFERENCES users(id),
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id integer NOT NULL REFERENCES users(id),
      name text NOT NULL DEFAULT '',
      key_hash text NOT NULL UNIQUE,
      key_prefix text NOT NULL DEFAULT '',
      last_used_at integer,
      created_at integer NOT NULL
    )
  `);
  // マルチテナント化: 既存テーブルへ所有者列を追加（既存行は既定ユーザー=1）。
  for (const table of [
    "transactions",
    "imports",
    "taxpayer_profiles",
    "fixed_assets",
    "receipts",
    "filing_status",
    "filing_snapshots",
  ]) {
    const columns = db.all<{ name: string }>(
      sql.raw(`PRAGMA table_info(${table})`),
    ) as { name: string }[];
    if (!columns.some((c) => c.name === "owner_user_id")) {
      db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN owner_user_id integer NOT NULL DEFAULT 1`));
    }
  }
  // マルチテナント化: 年度キーのテーブルは主キーを (owner_user_id, year) へ
  // 作り替える（既存行は所有者=1 で移行）。主キーが year 単独のときだけ実行。
  const rebuildYearKeyed = (table: string, columnsSql: string) => {
    const info = db.all<{ name: string; pk: number }>(
      sql.raw(`PRAGMA table_info(${table})`),
    ) as { name: string; pk: number }[];
    const pkColumns = info.filter((c) => c.pk > 0).map((c) => c.name);
    if (pkColumns.length === 1 && pkColumns[0] === "year") {
      const columnList = info.map((c) => c.name).join(", ");
      db.run(sql.raw(`CREATE TABLE ${table}_mt (${columnsSql}, PRIMARY KEY (owner_user_id, year))`));
      db.run(sql.raw(`INSERT INTO ${table}_mt (${columnList}) SELECT ${columnList} FROM ${table}`));
      db.run(sql.raw(`DROP TABLE ${table}`));
      db.run(sql.raw(`ALTER TABLE ${table}_mt RENAME TO ${table}`));
    }
  };
  rebuildYearKeyed(
    "taxpayer_profiles",
    `year integer NOT NULL, owner_user_id integer NOT NULL DEFAULT 1, name text NOT NULL DEFAULT '', name_kana text NOT NULL DEFAULT '', zip_code text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', address_line2 text NOT NULL DEFAULT '', birth_date text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', tax_office_name text NOT NULL DEFAULT '', tax_office_code text NOT NULL DEFAULT '', my_number text NOT NULL DEFAULT '', user_id text NOT NULL DEFAULT '', occupation text NOT NULL DEFAULT '', shop_name text NOT NULL DEFAULT '', jan1_address text NOT NULL DEFAULT '', invoice_number text NOT NULL DEFAULT '', previous_zip_code text NOT NULL DEFAULT '', previous_address text NOT NULL DEFAULT '', updated_at integer NOT NULL`,
  );
  rebuildYearKeyed(
    "filing_status",
    `year integer NOT NULL, owner_user_id integer NOT NULL DEFAULT 1, confirmed_at integer, calculated_at integer, submitted_at integer, updated_at integer NOT NULL`,
  );
  db.run(sql`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id integer PRIMARY KEY AUTOINCREMENT,
      slug text NOT NULL UNIQUE,
      number text NOT NULL DEFAULT '',
      title text NOT NULL,
      category text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '',
      content text NOT NULL,
      updated_at integer NOT NULL
    )
  `);
  // 日本語の部分一致検索用に trigram トークナイザを使う（rowid = knowledge_docs.id）。
  db.run(sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      title, content, tokenize='trigram'
    )
  `);
  tablesEnsured = true;
}
