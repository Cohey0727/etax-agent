/**
 * schema.ts — Drizzle ORM スキーマ（SQLite）。repositories 層の土台。
 *
 * デスクトップ同梱（Electron）に向け、DB はアプリのデータフォルダ内の
 * SQLite ファイルに置く。日時カラムは timestamp_ms モード（整数ミリ秒）で
 * 持ち、読み出し側では Date として扱う（従来の Postgres 実装と同じ感覚）。
 *
 * imports       : CSV取込の記録（ファイル名・自動マッピング結果・件数）
 * transactions  : 取引（取込元 imports への参照つき）
 * filing_status : 年度ごとの申告ステータス（確認・控除計算・提出の済み日時）
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const importsTable = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename"),
  sourceName: text("source_name"),
  /** CSV自動マッピングの結果（CsvMapping の JSON） */
  mapping: text("mapping", { mode: "json" }),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const transactionsTable = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** YYYY-MM-DD */
  date: text("date").notNull(),
  description: text("description").notNull().default(""),
  /** 符号つき税込金額（収入は正、支出は負） */
  amount: integer("amount").notNull(),
  account: text("account").notNull().default(""),
  category: text("category").notNull().default("未分類"),
  /** business / real_estate / other */
  incomeType: text("income_type").notNull().default("other"),
  /** 消費税の税区分（freee表記）。"" は未設定 */
  taxCategory: text("tax_category").notNull().default(""),
  importId: integer("import_id").references(() => importsTable.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const filingStatusTable = sqliteTable("filing_status", {
  /** 対象年（西暦） */
  year: integer("year").primaryKey(),
  /** 帳簿の内容を確認済みにした日時。未確認なら null */
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  /** 控除・税額計算を済ませた日時。未了なら null */
  calculatedAt: integer("calculated_at", { mode: "timestamp_ms" }),
  /** e-Tax で提出済みにした日時。未提出なら null */
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ImportRow = typeof importsTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type NewTransactionRow = typeof transactionsTable.$inferInsert;
export type FilingStatusRow = typeof filingStatusTable.$inferSelect;
