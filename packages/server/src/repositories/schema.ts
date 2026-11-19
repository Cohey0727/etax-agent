/**
 * schema.ts — Drizzle ORM スキーマ（SQLite）。repositories 層の土台。
 *
 * デスクトップ同梱（Electron）に向け、DB はアプリのデータフォルダ内の
 * SQLite ファイルに置く。日時カラムは timestamp_ms モード（整数ミリ秒）で
 * 持ち、読み出し側では Date として扱う（従来の Postgres 実装と同じ感覚）。
 *
 * imports           : CSV取込の記録（ファイル名・自動マッピング結果・件数）
 * transactions      : 取引（取込元 imports への参照つき）
 * filing_status     : 年度ごとの申告ステータス（確認・控除計算・提出の済み日時）
 * taxpayer_profiles : 年度ごとの納税者プロフィール（申告書の見出し情報）
 * filing_snapshots  : 「控除・計算」を確定した時点の計算結果の控え（確定の履歴）
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
  /**
   * 割り当て年度（この取引を計上する年）。既定は日付の年だが、年末の
   * カード利用など日付と違う年へ割り当てることがある。0 は未設定
   * （日付の年として扱う。既存DBの移行用で、起動時に日付の年で埋める）。
   */
  fiscalYear: integer("fiscal_year").notNull().default(0),
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

/**
 * 納税者プロフィール（年度別）。申告書の見出しに入る情報で、年度ごとに
 * 1行持つ（住所・インボイス番号などが年で変わるため）。個人番号も含むため
 * 値はアプリのDB内にのみ置き、出力リクエストの生成に使う。
 */
export const taxpayerProfilesTable = sqliteTable("taxpayer_profiles", {
  /** 対象年（西暦） */
  year: integer("year").primaryKey(),
  name: text("name").notNull().default(""),
  nameKana: text("name_kana").notNull().default(""),
  zipCode: text("zip_code").notNull().default(""),
  address: text("address").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  /** YYYY-MM-DD */
  birthDate: text("birth_date").notNull().default(""),
  phone: text("phone").notNull().default(""),
  taxOfficeName: text("tax_office_name").notNull().default(""),
  taxOfficeCode: text("tax_office_code").notNull().default(""),
  myNumber: text("my_number").notNull().default(""),
  /** 利用者識別番号（e-Tax、16桁）。XTX の IT 部必須要素 NOZEISHA_ID 用。 */
  userId: text("user_id").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  shopName: text("shop_name").notNull().default(""),
  jan1Address: text("jan1_address").notNull().default(""),
  invoiceNumber: text("invoice_number").notNull().default(""),
  /** 納税地の異動申出書用：異動・変更前の納税地（郵便番号・住所）。 */
  previousZipCode: text("previous_zip_code").notNull().default(""),
  previousAddress: text("previous_address").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * 確定スナップショット（年度別・確定のたびに1行）。
 * 「控除・計算」を確定した時点の計算結果を控えておき、差し戻して
 * 直してから再確定したときに、直前の確定と比べられるようにする。
 * 数字は画面側の計算結果をそのまま JSON で持つ（記録専用）。
 */
export const filingSnapshotsTable = sqliteTable("filing_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 対象年（西暦） */
  year: integer("year").notNull(),
  /** 確定した日時 */
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** 確定時点の計算結果（FilingSnapshotFigures の JSON） */
  figures: text("figures", { mode: "json" }).notNull(),
});

/**
 * 税務知識ベース（国税庁タックスアンサー等の本文を収録した参照用テーブル）。
 * 全文検索は knowledge_fts（FTS5・trigram）側で行い、rowid = 本テーブルの id で結ぶ。
 */
export const knowledgeDocsTable = sqliteTable("knowledge_docs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 一意キー（例: "nta-2072"） */
  slug: text("slug").notNull().unique(),
  /** 出典の番号（タックスアンサー番号。例: "2072"） */
  number: text("number").notNull().default(""),
  title: text("title").notNull(),
  /** 分野（例: 所得控除、消費税） */
  category: text("category").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  content: text("content").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ImportRow = typeof importsTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type NewTransactionRow = typeof transactionsTable.$inferInsert;
export type FilingStatusRow = typeof filingStatusTable.$inferSelect;
export type TaxpayerProfileRow = typeof taxpayerProfilesTable.$inferSelect;
export type FilingSnapshotRow = typeof filingSnapshotsTable.$inferSelect;
export type KnowledgeDocRow = typeof knowledgeDocsTable.$inferSelect;
