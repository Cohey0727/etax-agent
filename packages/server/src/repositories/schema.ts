/**
 * schema.ts — Drizzle ORM スキーマ（PostgreSQL）。repositories 層の土台。
 *
 * DB は PostgreSQL（DATABASE_URL で接続）。日時カラムは timestamptz
 * （mode: "date"）で持ち、読み出し側では Date として扱う。
 * JSON カラムは jsonb で持ち、読み出し側ではオブジェクトとして扱う。
 *
 * imports           : CSV取込の記録（ファイル名・自動マッピング結果・件数）
 * transactions      : 取引（取込元 imports への参照つき。論理削除）
 * transaction_history : 取引の変更履歴（登録・更新・削除の前後の値）
 * filing_status     : 年度ごとの申告ステータス（確認・控除計算・提出の済み日時）
 * taxpayer_profiles : 年度ごとの納税者プロフィール（申告書の見出し情報）
 * filing_snapshots  : 「控除・計算」を確定した時点の計算結果の控え（確定の履歴）
 * fixed_assets      : 固定資産台帳（減価償却の計算と決算書明細の元データ）
 * receipts          : 証憑（領収書画像）と取引の紐付け
 */
import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** 日時カラム（timestamptz、Date として読み書きする）。 */
const timestampColumn = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const importsTable = pgTable("imports", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  filename: text("filename"),
  sourceName: text("source_name"),
  /** CSV自動マッピングの結果（CsvMapping の JSON） */
  mapping: jsonb("mapping"),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  ownerUserId: integer("owner_user_id").notNull().default(1),
});

export const transactionsTable = pgTable("transactions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** YYYY-MM-DD */
  date: text("date").notNull(),
  /**
   * 割り当て年度（この取引を計上する年）。既定は日付の年だが、年末の
   * カード利用など日付と違う年へ割り当てることがある。0 は未設定
   * （日付の年として扱う。移行直後の行への保険で、起動時に日付の年で埋める）。
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
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
  /**
   * 論理削除の日時。null は有効な取引。電子帳簿保存法の訂正・削除履歴の
   * 要件のため、取引は物理削除せずこの列で削除済みにする。
   */
  deletedAt: timestampColumn("deleted_at"),
  ownerUserId: integer("owner_user_id").notNull().default(1),
});

/**
 * 取引の変更履歴（電子帳簿保存法の訂正・削除履歴）。
 * 取引の登録・更新・削除のたびに1行残し、変更前後の値を API 形式の
 * JSON スナップショットで保持する。登録は before が null、削除は
 * after に削除済みの状態（deleted_at 入り）を持つ。
 */
export const transactionHistoryTable = pgTable("transaction_history", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactionsTable.id),
  /** created / updated / deleted */
  action: text("action").notNull(),
  /** 変更前の値（TransactionResponse の JSON）。登録時は null */
  before: jsonb("before"),
  /** 変更後の値（TransactionResponse の JSON） */
  after: jsonb("after"),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const filingStatusTable = pgTable(
  "filing_status",
  {
    /** 対象年（西暦） */
    year: integer("year").notNull(),
    /** 帳簿の内容を確認済みにした日時。未確認なら null */
    confirmedAt: timestampColumn("confirmed_at"),
    /** 控除・税額計算を済ませた日時。未了なら null */
    calculatedAt: timestampColumn("calculated_at"),
    /** e-Tax で提出済みにした日時。未提出なら null */
    submittedAt: timestampColumn("submitted_at"),
    updatedAt: timestampColumn("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
    ownerUserId: integer("owner_user_id").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.year] })],
);

/**
 * 納税者プロフィール（年度別）。申告書の見出しに入る情報で、年度ごとに
 * 1行持つ（住所・インボイス番号などが年で変わるため）。個人番号も含むため
 * 値はアプリのDB内にのみ置き、出力リクエストの生成に使う。
 */
export const taxpayerProfilesTable = pgTable(
  "taxpayer_profiles",
  {
    /** 対象年（西暦） */
    year: integer("year").notNull(),
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
    updatedAt: timestampColumn("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
    ownerUserId: integer("owner_user_id").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.year] })],
);

/**
 * 確定スナップショット（年度別・確定のたびに1行）。
 * 「控除・計算」を確定した時点の計算結果を控えておき、差し戻して
 * 直してから再確定したときに、直前の確定と比べられるようにする。
 * 数字は画面側の計算結果をそのまま JSON で持つ（記録専用）。
 */
export const filingSnapshotsTable = pgTable("filing_snapshots", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 対象年（西暦） */
  year: integer("year").notNull(),
  /** 確定した日時 */
  confirmedAt: timestampColumn("confirmed_at")
    .notNull()
    .$defaultFn(() => new Date()),
  /** 確定時点の計算結果（FilingSnapshotFigures の JSON） */
  figures: jsonb("figures").notNull(),
  ownerUserId: integer("owner_user_id").notNull().default(1),
});

/**
 * 税務知識ベース（国税庁タックスアンサー等の本文を収録した参照用テーブル）。
 * 全文検索は pg_trgm の GIN インデックス（title / content）で高速化し、
 * 部分一致（ILIKE）で引く（knowledgeRepository 参照）。
 */
export const knowledgeDocsTable = pgTable("knowledge_docs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 一意キー（例: "nta-2072"） */
  slug: text("slug").notNull().unique(),
  /** 出典の番号（タックスアンサー番号。例: "2072"） */
  number: text("number").notNull().default(""),
  title: text("title").notNull(),
  /** 分野（例: 所得控除、消費税） */
  category: text("category").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  content: text("content").notNull(),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * 固定資産台帳。減価償却費の計算（shared の depreciation エンジン）と
 * 決算書・収支内訳書の「減価償却費の計算」欄の元データ。
 * 除却・売却した資産は disposed_date を入れて残す（台帳から消さない）。
 */
export const fixedAssetsTable = pgTable("fixed_assets", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** 資産の名称等 */
  name: text("name").notNull(),
  /** 面積又は数量（任意の表示用文字列） */
  quantity: text("quantity").notNull().default(""),
  /** business / real_estate */
  incomeType: text("income_type").notNull().default("business"),
  /** 取得年月日 YYYY-MM-DD */
  acquisitionDate: text("acquisition_date").notNull(),
  /** 事業供用年月日 YYYY-MM-DD。未設定なら取得日 */
  serviceStartDate: text("service_start_date"),
  /** 取得価額（円） */
  cost: integer("cost").notNull(),
  /** 耐用年数（年） */
  usefulLifeYears: integer("useful_life_years").notNull(),
  /** straight_line / declining_balance / lump_sum / small_special */
  method: text("method").notNull().default("straight_line"),
  /** 事業専用割合（不動産は貸付割合）0〜100 */
  businessRatioPercent: integer("business_ratio_percent").notNull().default(100),
  /** 除却・売却日 YYYY-MM-DD。未除却なら null */
  disposedDate: text("disposed_date"),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
  ownerUserId: integer("owner_user_id").notNull().default(1),
});

export type ImportRow = typeof importsTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type TransactionHistoryRow = typeof transactionHistoryTable.$inferSelect;
export type NewTransactionRow = typeof transactionsTable.$inferInsert;
export type FilingStatusRow = typeof filingStatusTable.$inferSelect;
export type TaxpayerProfileRow = typeof taxpayerProfilesTable.$inferSelect;
export type FilingSnapshotRow = typeof filingSnapshotsTable.$inferSelect;
export type KnowledgeDocRow = typeof knowledgeDocsTable.$inferSelect;
/**
 * 証憑（領収書画像など）と取引の紐付け。
 * 画像そのものはストレージ（files/receipts/<fileId>）にあり、本テーブルは
 * ファイルID・解析結果・紐付け先の取引を持つ。解析（/api/receipts/analyze）
 * のたびに fileId で upsert し、帳簿への追加や管理画面から取引へ紐付ける。
 * 電子帳簿保存法の「書類と取引の相互関連性」のための記録。
 */
export const receiptsTable = pgTable("receipts", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** ストレージ上のファイルID（アップロード時に発行される UUID） */
  fileId: text("file_id").notNull().unique(),
  mimeType: text("mime_type").notNull().default(""),
  /** 解析結果（AnalyzeReceiptResponse の JSON）。未解析なら null */
  extracted: jsonb("extracted"),
  /** 紐付け先の取引。未紐付けなら null */
  transactionId: integer("transaction_id").references(() => transactionsTable.id),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
  ownerUserId: integer("owner_user_id").notNull().default(1),
});

export type ReceiptRow = typeof receiptsTable.$inferSelect;
export type NewReceiptRow = typeof receiptsTable.$inferInsert;

/**
 * ユーザー（SaaS のマルチテナントの単位）。
 * ローカル運用（認証オフ）では行を作らず、データの所有者は既定の 1 として扱う。
 */
export const usersTable = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: text("email").notNull().unique(),
  /** Bun.password（argon2id）のハッシュ。OAuth・マジックリンクのみのユーザーは空 */
  passwordHash: text("password_hash").notNull().default(""),
  /** TOTP 秘密（保存時暗号化した Base32）。未設定は空文字 */
  totpSecret: text("totp_secret").notNull().default(""),
  /** TOTP 2要素認証が有効か */
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  /**
   * メールアドレスの所有確認が済んでいるか。パスワード登録だけでは
   * 他人のメールでも登録できてしまう（Pre-Account Takeover）ため、
   * SaaS 運用では確認が済むまでパスワードログインを許可しない。
   * 既存行は DDL の DEFAULT true で確認済みとして移行する。
   */
  emailVerified: boolean("email_verified").notNull().default(true),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** マジックリンクのログイン用トークン。平文は保存せず SHA-256 ハッシュで持つ。 */
export const magicLinkTokensTable = pgTable("magic_link_tokens", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestampColumn("expires_at").notNull(),
  usedAt: timestampColumn("used_at"),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** 登録時のメール確認用トークン。平文は保存せず SHA-256 ハッシュで持つ。 */
export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestampColumn("expires_at").notNull(),
  usedAt: timestampColumn("used_at"),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** OAuth（Google / GitHub）の外部IDとユーザーの対応。 */
export const userIdentitiesTable = pgTable("user_identities", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** ログインセッション。トークン自体は保存せず SHA-256 ハッシュで持つ。 */
export const sessionsTable = pgTable("sessions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestampColumn("expires_at").notNull(),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** 外部エージェント（MCP）接続用の API キー。キー自体は保存せずハッシュで持つ。 */
export const apiKeysTable = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  name: text("name").notNull().default(""),
  keyHash: text("key_hash").notNull().unique(),
  /** 表示用の接頭辞（例: etax_ Ab3dEf5） */
  keyPrefix: text("key_prefix").notNull().default(""),
  lastUsedAt: timestampColumn("last_used_at"),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export type UserRow = typeof usersTable.$inferSelect;
export type MagicLinkTokenRow = typeof magicLinkTokensTable.$inferSelect;
export type EmailVerificationTokenRow = typeof emailVerificationTokensTable.$inferSelect;
export type UserIdentityRow = typeof userIdentitiesTable.$inferSelect;
export type SessionRow = typeof sessionsTable.$inferSelect;
export type ApiKeyRow = typeof apiKeysTable.$inferSelect;

/**
 * 申告入力（控除・税額控除・雑所得・申告種別）の年度別保存。
 * 形は画面側の DeductionState（JSON）で、サーバーは検証せずそのまま持つ。
 * 以前はブラウザの localStorage に保存していたものをサーバーDBへ移行した。
 */
export const filingInputsTable = pgTable(
  "filing_inputs",
  {
    ownerUserId: integer("owner_user_id").notNull().default(1),
    year: integer("year").notNull(),
    /** DeductionState の JSON */
    state: text("state").notNull(),
    updatedAt: timestampColumn("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.year] })],
);

export type FilingInputRow = typeof filingInputsTable.$inferSelect;

/**
 * 課金（Stripe サブスクリプション）の状態。所有者ごとに1件。
 * status は Stripe の subscription.status をそのまま持つ
 * （active / trialing / past_due / canceled / incomplete 等）。
 */
export const subscriptionsTable = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ownerUserId: integer("owner_user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").notNull().default(""),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().default(""),
  status: text("status").notNull().default("none"),
  currentPeriodEnd: timestampColumn("current_period_end"),
  /** 最後に適用した Webhook イベントの作成時刻（順序逆転の検出用）。 */
  lastEventCreatedAt: timestampColumn("last_event_created_at"),
  updatedAt: timestampColumn("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export type SubscriptionRow = typeof subscriptionsTable.$inferSelect;

/** 処理済み Stripe Webhook イベント（冪等性のためイベントIDを記録する）。 */
export const stripeWebhookEventsTable = pgTable("stripe_webhook_events", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull().default(""),
  createdAt: timestampColumn("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export type StripeWebhookEventRow = typeof stripeWebhookEventsTable.$inferSelect;

export type FixedAssetRow = typeof fixedAssetsTable.$inferSelect;
export type NewFixedAssetRow = typeof fixedAssetsTable.$inferInsert;
