import { BalanceSheetWireInput, FilingType, Transaction } from "@etax/shared";

export interface CsvMapping {
  dateColumn: string | null;
  descriptionColumn: string | null;
  amountColumn: string | null;
  debitColumn: string | null;
  creditColumn: string | null;
  balanceColumn: string | null;
  accountColumn: string | null;
  dateFormat: string;
  amountSign: "as-is" | "inverted" | "split";
}

export interface ImportCsvResponse {
  mapping: CsvMapping;
  mappingSource: "ai" | "heuristic";
  encoding: string;
  filename: string;
  count: number;
  totalRows: number;
  skippedRows: number;
  duplicatesSkipped: number;
  persisted: boolean;
  importId: number | null;
  persistWarning: string | null;
  transactions: Transaction[];
  error?: string;
}

export interface AgentChatResponse {
  reply: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: unknown }>;
  error?: string;
}

export type ClassificationSource = "generated" | "systemone" | "rules" | "none";

/** SystemOne（jev）接続設定。APIキーの実値はサーバーから返らない。 */
export interface SystemOneSettings {
  baseUrl: string;
  model: string;
  apiKeySet: boolean;
  effectiveBaseUrl: string;
  effectiveModel: string | null;
}

export interface SystemOneTestResult {
  ok: boolean;
  top: string | null;
  error: string | null;
}

/** 外部エージェント連携（MCP）用 API キー。平文キーは発行時のみ返る。 */
export interface ApiKeyItem {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

/** API キー発行の結果（平文キーを含む、この応答でしか見られない）。 */
export interface CreatedApiKey extends ApiKeyItem {
  key: string;
}

/** 外部接続（AI）の接続テスト結果。 */
export interface AgentTestResult {
  ok: boolean;
  model: string | null;
  reply: string | null;
  error: string | null;
}

/** 正規表現ルール1件（自動生成・手編集カスタム共通）。 */
export interface RegexRuleItem {
  pattern: string;
  category: string;
}

/** 正規表現ルール一式（カスタム／自動生成／実効）。 */
export interface RegexRulesInfo {
  customRules: RegexRuleItem[];
  usingCustom: boolean;
  generatedRules: Array<RegexRuleItem & { count: number; example: string }>;
  effectiveRules: RegexRuleItem[];
}

/** jev用プロンプト一式（カスタム／自動生成／実効）。 */
export interface JevPromptInfo {
  customPrompt: string;
  generatedPrompt: string;
  effectivePrompt: string;
}

export interface AccountClassification {
  account: string;
  confidence: number | null;
  source: ClassificationSource;
  candidates: Array<{ account: string; probability: number }>;
}

export interface AnalyzeReceiptResponse {
  date: string | null;
  amount: number | null;
  payee: string;
  description: string;
  classification: AccountClassification;
}

/** 署名付きアップロードURLの発行結果。ファイルIDで解析を依頼する。 */
export interface PresignUploadFileResponse {
  fileId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface FreeeTrialBalanceAccount {
  name: string;
  category: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface FreeeTrialBalance {
  source: string;
  years: Array<{ year: number; accounts: FreeeTrialBalanceAccount[] }>;
}

/* ---------- 試算表レポート（POST /api/calc/trial-balance） ---------- */

export interface TrialBalanceLine {
  category: string;
  /** ドリルダウン用：この行に含まれる実際の勘定科目名 */
  categories: string[];
  amount: number;
}

export interface TrialBalancePl {
  revenue_lines: TrialBalanceLine[];
  revenue: number;
  purchases: number;
  expense_lines: TrialBalanceLine[];
  expenses: number;
  income_before_blue: number;
  blue_deduction: number;
  income: number;
}

export interface TrialBalanceOther {
  revenue_lines: TrialBalanceLine[];
  revenue: number;
  expense_lines: TrialBalanceLine[];
  expenses: number;
}

export interface TrialBalanceMonth {
  month: number;
  revenue: number;
  expenses: number;
  balance: number;
  cumulative: number;
}

export interface TrialBalanceBsRow {
  key: string;
  label: string;
  opening: number;
  closing: number;
}

export interface TrialBalanceBs {
  asset_rows: TrialBalanceBsRow[];
  liability_rows: TrialBalanceBsRow[];
  owner_loan: number;
  owner_borrowing: number;
  capital: number;
  income_before_blue: number;
  opening_assets: number;
  opening_liabilities_capital: number;
  closing_assets: number;
  closing_liabilities_capital: number;
  opening_balanced: boolean;
  closing_balanced: boolean;
}

export interface TrialBalanceReport {
  year: number;
  business: TrialBalancePl;
  real_estate: TrialBalancePl;
  other: TrialBalanceOther;
  monthly: TrialBalanceMonth[];
  balance_sheet: TrialBalanceBs | null;
}

export interface TrialBalanceResponse extends TrialBalanceReport {
  previous: TrialBalanceReport;
}

export interface FetchTrialBalanceRequest {
  transactions: Transaction[];
  year: number;
  filing_type?: FilingType;
  real_estate_business_scale?: boolean;
  /** 貸借対照表の入力（保存済みの申告入力からワイヤ形式で渡す）。 */
  balance_sheet?: BalanceSheetWireInput;
}

/* ---------- 資金繰りレポート（GET /api/cash-flow） ---------- */

export interface CashFlowMonth {
  /** YYYY-MM */
  month: string;
  phase: "past" | "current" | "future";
  actual_inflow: number;
  actual_outflow: number;
  scheduled_inflow: number;
  net_change: number;
  closing_balance: number;
}

export interface CashFlowReceipt {
  document_id: number;
  document_number: string | null;
  counterparty_name: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  remaining_amount: number;
  status: "unpaid" | "partial" | "paid";
}

export interface CashFlowScheduledReceipt extends CashFlowReceipt {
  scheduled_month: string;
  overdue: boolean;
}

export interface CashFlowReport {
  from_month: string;
  to_month: string;
  opening_balance: number;
  months: CashFlowMonth[];
  upcoming_receipts: CashFlowScheduledReceipt[];
  undated_receipts: CashFlowReceipt[];
  total_actual_inflow: number;
  total_actual_outflow: number;
  total_scheduled_inflow: number;
  overdue_amount: number;
  projected_closing_balance: number;
}

export interface FetchCashFlowRequest {
  /** 表示窓の開始月（YYYY-MM）。省略時はサーバーの既定窓 */
  from?: string;
  /** 表示する月数（1〜24） */
  months?: number;
  /** 窓の開始月初時点の残高 */
  opening_balance?: number;
}

/** 年度ごとの申告ステータス。サーバーAPIのワイヤ形式（snake_case）。 */
export interface FilingStatus {
  year: number;
  confirmed: boolean;
  confirmed_at: string | null;
  calculated: boolean;
  calculated_at: string | null;
  submitted: boolean;
  submitted_at: string | null;
}

/** 確定時点の計算結果の控え（金額はすべて円）。サーバーAPIのワイヤ形式（snake_case）。 */
export interface FilingSnapshotFigures {
  business_income: number;
  real_estate_income: number;
  misc_income: number;
  total_income: number;
  total_deductions: number;
  taxable_income: number;
  final_tax: number;
}

/** 「控除・計算」を確定した時点の計算結果スナップショット。 */
export interface FilingSnapshot {
  id: number;
  year: number;
  confirmed_at: string;
  figures: FilingSnapshotFigures;
}

/** 帳簿（DB）に保存された取引1件。サーバーAPIのワイヤ形式（snake_case）。 */
export interface LedgerTransaction {
  id: number;
  date: string;
  /** 割り当て年度（この取引を計上する年）。既定は日付の年。 */
  fiscal_year: number;
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
  tax_category: string;
  /** 事業専用割合（家事按分、0〜100の整数）。100 は全額事業分 */
  business_ratio_percent: number;
  /** 按分根拠のメモ（任意） */
  business_ratio_basis: string;
  import_id: number | null;
  created_at: string;
}

export interface ListLedgerTransactionsResponse {
  count: number;
  transactions: LedgerTransaction[];
}

/** 帳簿へ保存するときの取引入力（id を持たない形）。 */
export interface LedgerTransactionInput {
  date: string;
  fiscal_year: number;
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
  tax_category: string;
  /** 事業専用割合（家事按分、0〜100の整数） */
  business_ratio_percent: number;
  /** 按分根拠のメモ（任意） */
  business_ratio_basis: string;
}

/** 証憑（領収書画像）レコード。サーバーAPIのワイヤ形式（snake_case）。 */
export interface ReceiptRecord {
  id: number;
  file_id: string;
  mime_type: string;
  extracted: AnalyzeReceiptResponse | null;
  transaction_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptListResponse {
  receipts: ReceiptRecord[];
}

/** 償却方法。サーバーAPI・共有エンジンと共通の値。 */
export type DepreciationMethod =
  | "straight_line"
  | "declining_balance"
  | "lump_sum"
  | "small_special";

/** 固定資産レコード。サーバーAPIのワイヤ形式（snake_case）。 */
export interface FixedAssetRecord {
  id: number;
  name: string;
  quantity: string;
  income_type: string;
  acquisition_date: string;
  service_start_date: string | null;
  cost: number;
  useful_life_years: number;
  method: DepreciationMethod;
  business_ratio_percent: number;
  disposed_date: string | null;
  created_at: string;
  updated_at: string;
}

/** 固定資産の登録・更新入力（サーバーの Create/Update スキーマに対応）。 */
export interface FixedAssetInput {
  name: string;
  quantity: string;
  income_type: string;
  acquisition_date: string;
  service_start_date: string | null;
  cost: number;
  useful_life_years: number;
  method: DepreciationMethod;
  business_ratio_percent: number;
  disposed_date: string | null;
}

/** 請求書の明細行。サーバーAPIのワイヤ形式（snake_case）。 */
export interface InvoiceLineRecord {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate_percent: number;
  is_reduced_rate: boolean;
  amount: number;
}

/** 発行時点の発行者スナップショット。 */
export interface InvoiceIssuerRecord {
  name: string;
  zip_code: string;
  address: string;
  invoice_number: string;
}

/** 税率ごとの集計（適格請求書の記載事項）。 */
export interface InvoiceRateGroupRecord {
  tax_rate_percent: number;
  subtotal: number;
  tax: number;
}

export interface InvoiceTotalsRecord {
  groups: InvoiceRateGroupRecord[];
  subtotal: number;
  tax_total: number;
  total: number;
}

/** 請求書レコード。発行済み（issued）は不変で、修正は新規の修正書類で行う。 */
export interface InvoiceRecord {
  id: number;
  kind: string;
  status: "draft" | "issued";
  document_number: string | null;
  issue_date: string;
  due_date: string | null;
  counterparty_name: string;
  counterparty_address: string;
  is_qualified: boolean;
  tax_rounding: InvoiceTaxRounding;
  memo: string;
  corrects_document_id: number | null;
  corrects_document_number: string | null;
  issuer: InvoiceIssuerRecord | null;
  lines: InvoiceLineRecord[];
  totals: InvoiceTotalsRecord;
  /** 入金消込の状態。下書きは null */
  payment_status: InvoicePaymentStatus | null;
  /** 消込済み額（差額調整を含む）。 */
  settled_amount: number;
  /** 未消込の残額。 */
  remaining_amount: number;
  created_at: string;
  updated_at: string;
}

/** 消込レコードの種別。fee / discount は差額調整、overpayment は過入金の預り金。 */
export type InvoicePaymentKind = "payment" | "fee" | "discount" | "overpayment";

/** 請求書の消込状態。 */
export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";

/** 消込サマリ（サーバーが消込レコードから計算する）。 */
export interface InvoiceSettlementRecord {
  total_amount: number;
  settled_amount: number;
  remaining_amount: number;
  overpaid_amount: number;
  status: InvoicePaymentStatus;
}

/** 消込レコード。transaction は紐付く取引（入金または自動生成の調整取引）。 */
export interface InvoicePaymentRecord {
  id: number;
  document_id: number;
  transaction_id: number;
  adjustment_transaction_id: number | null;
  kind: InvoicePaymentKind;
  amount: number;
  transaction: LedgerTransaction | null;
  created_at: string;
}

export interface InvoicePaymentsResult {
  payments: InvoicePaymentRecord[];
  settlement: InvoiceSettlementRecord;
}

/** 消込の作成入力。amount 省略時は未消込額と請求残額の小さい方を充当する。 */
export interface CreateInvoicePaymentInput {
  transaction_id: number;
  amount?: number;
  fee_amount?: number;
  discount_amount?: number;
  treat_excess_as_deposit?: boolean;
}

/** 消込候補の推測理由。 */
export type ReconciliationReason = "amount_exact" | "amount_partial" | "name_match" | "date_close";

/** 自動推測の消込候補。承認するまで消込は確定しない。 */
export interface ReconciliationCandidateRecord {
  transaction: LedgerTransaction;
  unapplied_amount: number;
  suggested_amount: number;
  score: number;
  reasons: ReconciliationReason[];
}

/** 消費税額の端数処理方法。 */
export type InvoiceTaxRounding = "floor" | "round" | "ceil";

/** 請求書の明細入力。 */
export interface InvoiceLineInput {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate_percent: number;
  is_reduced_rate: boolean;
}

/** 請求書の作成・更新入力（サーバーの Create/Update スキーマに対応）。 */
export interface InvoiceInput {
  issue_date: string;
  due_date: string | null;
  counterparty_name: string;
  counterparty_address: string;
  is_qualified: boolean;
  tax_rounding: InvoiceTaxRounding;
  memo: string;
  lines: InvoiceLineInput[];
}

/** 発行控えの検索条件（日付・金額・取引先）。 */
export interface InvoiceSearchFilters {
  q?: string;
  from?: string;
  to?: string;
  min_total?: number;
  max_total?: number;
  status?: "draft" | "issued";
}

/** 固定資産に添付した画像。url は表示用（署名付きURLか配信パス）。 */
export interface FixedAssetImageRecord {
  id: number;
  asset_id: number;
  file_id: string;
  mime_type: string;
  url: string;
  created_at: string;
}

/** 指定年度の償却明細（資産ごと1行）。 */
export interface DepreciationRowRecord {
  asset_id: number;
  name: string;
  income_type: string;
  year: number;
  months: number;
  opening_book_value: number;
  basis_amount: number;
  rate: number;
  guarantee_amount: number | null;
  ordinary: number;
  deductible: number;
  closing_book_value: number;
}

/** 指定年度の償却サマリ（GET /api/fixed-assets/depreciation の応答）。 */
export interface DepreciationSummary {
  year: number;
  rows: DepreciationRowRecord[];
  deductible_totals: { business: number; real_estate: number };
  small_special: { total: number; cap: number; exceeded: boolean };
}

/** e-Tax XTX出力の納税者情報。サーバーAPIのワイヤ形式（snake_case）。 */
export interface XtxTaxpayerInput {
  name: string;
  name_kana: string;
  zip_code: string;
  address: string;
  address_line2: string;
  birth_date: string;
  phone: string;
  tax_office_name: string;
  tax_office_code: string;
  my_number: string;
  /** 利用者識別番号（e-Tax、16桁）。XTX の IT 部必須要素 NOZEISHA_ID 用。 */
  user_id: string;
  occupation: string;
  shop_name: string;
  jan1_address: string;
  /** インボイス登録番号（T+13桁）。プロフィールとして年度別に保持する。 */
  invoice_number: string;
  /** 納税地の異動申出書用：異動・変更前の納税地（郵便番号・住所）。 */
  previous_zip_code: string;
  previous_address: string;
}

/** e-Tax 申告等データ（XTX）出力のリクエスト。 */
export interface ExportXtxRequest {
  year: number;
  amendment: boolean;
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
  transactions: Transaction[];
  deductions: unknown;
  tax_credits: unknown;
  /** 雑所得（その他）。帳簿に載らない所得として申告数値に含める。 */
  misc_income?: { revenue: number; income: number; kubun: number };
  /** 給与所得。帳簿に載らない給与として申告数値に含める（収入金額のみ）。 */
  salary_income?: { revenue: number };
  /** 申告の種類（青色申告特別控除の区分）。未指定なら青色65万円。 */
  filing_type?: FilingType;
  /** 不動産貸付けが事業的規模か */
  real_estate_business_scale?: boolean;
  withholding_tax: number;
  prepaid_tax: number;
  original_third_period_tax: number | null;
  /** 貸借対照表の入力（事業所得分。保存済みの申告入力からワイヤ形式で渡す）。 */
  balance_sheet?: BalanceSheetWireInput;
}

/** e-Tax 申告等データ（XTX）出力のレスポンス。 */
export interface ExportXtxResponse {
  filename: string;
  xtx: string;
  /** 公式XSD検証を行えなかった場合の警告。検証が通れば null。 */
  xsd_warning: string | null;
}

/** 申告書の紙イメージ PDF 出力のレスポンス。リクエストは XTX 出力と共通。 */
export interface ExportReturnPdfResponse {
  filename: string;
  pdf_base64: string;
}

/** 納税地の異動申出書（印刷用 PDF）出力のリクエスト。 */
export interface ExportDomicilePdfRequest {
  year: number;
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
}

/** 納税地の異動申出書（印刷用 PDF）出力のレスポンス。 */
export interface ExportDomicilePdfResponse {
  filename: string;
  pdf_base64: string;
}

/** 開業届・青色申告承認申請書の所得の種類。 */
export type BusinessStartIncomeType = "real_estate" | "forest" | "business";

/** 青色申告承認申請書 6(1) の簿記方式。 */
export type BookkeepingMethod = "double" | "simple" | "other";

/** 給与等の支払の状況の1行（専従者・使用人・その他）。 */
export interface SalarySituationRow {
  /** 従事員数。未入力は null。 */
  count: number | null;
  /** 給与の定め方（日給・月給など）。 */
  terms: string;
  /** 税額の有無。未選択は null。 */
  has_tax: boolean | null;
}

/**
 * 開業届・青色申告承認申請書の専用入力（プロフィールに無い項目）。
 * 開業は一度きりの手続きで年度に属さないため、保存は所有者ごとの
 * 専用保存（サーバーの business_start_inputs）になる。
 */
export interface BusinessStartInputs {
  start_date: string;
  shop_name_kana: string;
  business_overview: string;
  income_types: BusinessStartIncomeType[];
  submits_blue_application: boolean;
  submits_consumption_election: boolean;
  other_zip_code: string;
  other_address: string;
  other_phone: string;
  /** 青色申告を開始する年分。0 は未入力（開業年を使う）。 */
  blue_start_year: number;
  offices: { name: string; location: string }[];
  blue_cancellation_has: boolean | null;
  blue_cancellation_date: string;
  inheritance_has: boolean | null;
  inheritance_date: string;
  predecessor_name: string;
  bookkeeping: BookkeepingMethod | null;
  bookkeeping_other: string;
  /** 備付帳簿名（BLUE_BOOK_OPTIONS のキー）。 */
  books: string[];
  blue_other_notes: string;
  salary_family: SalarySituationRow;
  salary_employee: SalarySituationRow;
  salary_other_label: string;
  salary_other: SalarySituationRow;
  withholding_special: boolean | null;
  salary_start_date: string;
  other_notes: string;
}

/** 開業の専用入力の取得レスポンス。未保存なら state は null。 */
export interface BusinessStartInputsResponse {
  state: BusinessStartInputs | null;
  updated_at: string | null;
}

/** 開業届・青色申告承認申請書 PDF 出力のリクエスト。 */
export interface ExportBusinessStartPdfRequest {
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
  inputs: BusinessStartInputs;
}

/** 開業届・青色申告承認申請書 PDF 出力のレスポンス。 */
export interface ExportBusinessStartPdfResponse {
  filename: string;
  pdf_base64: string;
}

/** 消費税申告書（本則）XTX出力のリクエスト。金額は税込・確定値で渡す。 */
export interface ExportConsumptionXtxRequest {
  taxpayer: XtxTaxpayerInput;
  period_from: string;
  period_to: string;
  submission_date: string;
  filing_kind: 1 | 3;
  base_period_sales_thousands: number;
  sales_incl_10: number;
  sales_incl_8: number;
  nontaxable_sales: number;
  exempt_sales: number;
  purchases_incl_10: number;
  purchases_incl_8: number;
  interim_national: number;
  interim_local: number;
  original_national: number | null;
  original_local: number | null;
}

/** 消費税申告書（本則）XTX出力のレスポンス。 */
export interface ExportConsumptionXtxResponse {
  filename: string;
  xtx: string;
  total_payable: number;
  /** 公式XSD検証を行えなかった場合の警告。検証が通れば null。 */
  xsd_warning: string | null;
}

/** 提出の記録の税目。income = 所得税、consumption = 消費税。 */
export type FilingSubmissionKind = "income" | "consumption";

/** 提出の記録（受付番号・提出日・受信通知PDF）。年度×税目ごとに1件。 */
export interface FilingSubmission {
  year: number;
  kind: FilingSubmissionKind;
  /** 受信通知の受付番号。未記録なら空文字 */
  acceptance_number: string;
  /** 提出日 YYYY-MM-DD。未記録なら null */
  submitted_date: string | null;
  /** 受信通知PDF。未添付なら null */
  receipt: { file_id: string; mime_type: string } | null;
  updated_at: string;
}

/** 履歴スナップショットとしての取引（削除日時・更新日時を含む完全な形）。 */
export interface LedgerTransactionSnapshot extends LedgerTransaction {
  updated_at: string;
  /** 論理削除の日時。削除済みのときだけ値が入る */
  deleted_at: string | null;
}

/** 取引の変更履歴1件（登録・訂正・削除の記録、電帳法の訂正・削除履歴）。 */
export interface TransactionHistoryEntry {
  id: number;
  transaction_id: number;
  /** created / updated / deleted */
  action: string;
  before: LedgerTransactionSnapshot | null;
  after: LedgerTransactionSnapshot | null;
  created_at: string;
}

/** 提出の記録の変更履歴1件（登録・更新・削除の記録）。 */
export interface FilingSubmissionHistoryEntry {
  id: number;
  year: number;
  kind: FilingSubmissionKind;
  /** created / updated / deleted */
  action: string;
  before: FilingSubmission | null;
  after: FilingSubmission | null;
  created_at: string;
}

/** ログインユーザー（/api/auth/me・ログイン応答）。 */
export interface AuthUser {
  id: number;
  email: string;
  totp_enabled?: boolean;
}

/** 利用可能なログイン方法（/api/auth/config）。 */
export interface AuthMethods {
  password: boolean;
  magic_link: boolean;
  totp: boolean;
  passkey: boolean;
  google: boolean;
  github: boolean;
}

/** 認証の公開設定（/api/auth/config）。 */
export interface AuthConfig {
  required: boolean;
  methods: AuthMethods;
}

/** ログイン応答（TOTP 有効時は totp_required + challenge が返る）。 */
export interface LoginResponse {
  user?: AuthUser;
  token?: string;
  totp_required?: boolean;
  challenge?: string;
  /** 登録直後（メール確認待ち）。セッションはまだ発行されていない。 */
  verification_required?: boolean;
}

/** 課金の状態（/api/billing/plan）。 */
export interface BillingPlan {
  billing_enabled: boolean;
  status: string;
  current_period_end: string | null;
}
