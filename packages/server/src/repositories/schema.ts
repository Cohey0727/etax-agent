/**
 * schema.ts — Drizzle ORM スキーマ（Postgres）。repositories 層の土台。
 *
 * imports       : CSV取込の記録（ファイル名・自動マッピング結果・件数）
 * transactions  : 取引（取込元 imports への参照つき）
 * filing_status : 年度ごとの申告ステータス（確認・控除計算・提出の済み日時）
 */
import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const importsTable = pgTable("imports", {
  id: serial("id").primaryKey(),
  filename: text("filename"),
  sourceName: text("source_name"),
  /** CSV自動マッピングの結果（CsvMapping の JSON） */
  mapping: jsonb("mapping"),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  /** YYYY-MM-DD */
  date: varchar("date", { length: 10 }).notNull(),
  description: text("description").notNull().default(""),
  /** 符号つき税込金額（収入は正、支出は負） */
  amount: integer("amount").notNull(),
  account: text("account").notNull().default(""),
  category: text("category").notNull().default("未分類"),
  /** business / real_estate / other */
  incomeType: text("income_type").notNull().default("other"),
  importId: integer("import_id").references(() => importsTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const filingStatusTable = pgTable("filing_status", {
  /** 対象年（西暦） */
  year: integer("year").primaryKey(),
  /** 帳簿の内容を確認済みにした日時。未確認なら null */
  confirmedAt: timestamp("confirmed_at"),
  /** 控除・税額計算を済ませた日時。未了なら null */
  calculatedAt: timestamp("calculated_at"),
  /** e-Tax で提出済みにした日時。未提出なら null */
  submittedAt: timestamp("submitted_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ImportRow = typeof importsTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type NewTransactionRow = typeof transactionsTable.$inferInsert;
export type FilingStatusRow = typeof filingStatusTable.$inferSelect;
