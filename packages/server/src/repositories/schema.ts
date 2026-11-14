/**
 * schema.ts — Drizzle ORM スキーマ（Postgres）。repositories 層の土台。
 *
 * imports      : CSV取込の記録（ファイル名・自動マッピング結果・件数）
 * transactions : 取引（取込元 imports への参照つき）
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

export type ImportRow = typeof importsTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type NewTransactionRow = typeof transactionsTable.$inferInsert;
