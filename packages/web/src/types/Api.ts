import { FilingType, Transaction } from "@etax/shared";

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
}

/** e-Tax 申告等データ（XTX）出力のレスポンス。 */
export interface ExportXtxResponse {
  filename: string;
  xtx: string;
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
