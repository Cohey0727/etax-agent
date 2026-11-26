/**
 * types.ts — サーバーAPIのワイヤ形式（snake_case）の型。
 * 画面共通のドメイン型は @etax/shared を使い、ここには API 応答・入力の形だけを置く。
 */
import { FilingType, Transaction } from "@etax/shared";

/* ---------- 認証 ---------- */

export interface AuthUser {
  id: number;
  email: string;
  totp_enabled?: boolean;
}

export interface AuthMethods {
  password: boolean;
  magic_link: boolean;
  totp: boolean;
  passkey: boolean;
  google: boolean;
  github: boolean;
}

export interface AuthConfig {
  required: boolean;
  methods: AuthMethods;
}

export interface LoginResponse {
  user?: AuthUser;
  token?: string;
  totp_required?: boolean;
  challenge?: string;
  verification_required?: boolean;
}

export interface BillingPlan {
  billing_enabled: boolean;
  status: string;
  current_period_end: string | null;
}

/* ---------- 帳簿 ---------- */

export interface LedgerTransaction {
  id: number;
  date: string;
  fiscal_year: number;
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
  tax_category: string;
  business_ratio_percent: number;
  business_ratio_basis: string;
  import_id: number | null;
  created_at: string;
}

export interface LedgerTransactionInput {
  date: string;
  fiscal_year: number;
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
  tax_category: string;
  business_ratio_percent: number;
  business_ratio_basis: string;
}

export interface LedgerTransactionSnapshot extends LedgerTransaction {
  updated_at: string;
  deleted_at: string | null;
}

export interface TransactionHistoryEntry {
  id: number;
  transaction_id: number;
  action: string;
  before: LedgerTransactionSnapshot | null;
  after: LedgerTransactionSnapshot | null;
  created_at: string;
}

/* ---------- 取込 ---------- */

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

/* ---------- 科目判定 ---------- */

export type ClassificationSource = "generated" | "systemone" | "rules" | "none";

export interface AccountClassification {
  account: string;
  confidence: number | null;
  source: ClassificationSource;
  candidates: Array<{ account: string; probability: number }>;
}

/* ---------- 領収書 ---------- */

export interface AnalyzeReceiptResponse {
  date: string | null;
  amount: number | null;
  payee: string;
  description: string;
  classification: AccountClassification;
}

export interface ReceiptRecord {
  id: number;
  file_id: string;
  mime_type: string;
  extracted: AnalyzeReceiptResponse | null;
  transaction_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PresignUploadFileResponse {
  fileId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/* ---------- 固定資産 ---------- */

export type DepreciationMethod =
  | "straight_line"
  | "declining_balance"
  | "lump_sum"
  | "small_special";

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

export interface FixedAssetImageRecord {
  id: number;
  asset_id: number;
  file_id: string;
  mime_type: string;
  url: string;
  created_at: string;
}

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

export interface DepreciationSummary {
  year: number;
  rows: DepreciationRowRecord[];
  deductible_totals: { business: number; real_estate: number; agriculture: number };
  small_special: { total: number; cap: number; exceeded: boolean };
}

/* ---------- 試算表・資金繰り ---------- */

export interface TrialBalanceLine {
  category: string;
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

export interface CashFlowMonth {
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

/* ---------- 申告 ---------- */

export interface FilingStatus {
  year: number;
  confirmed: boolean;
  confirmed_at: string | null;
  calculated: boolean;
  calculated_at: string | null;
  submitted: boolean;
  submitted_at: string | null;
}

export interface FilingSnapshotFigures {
  business_income: number;
  real_estate_income: number;
  misc_income: number;
  total_income: number;
  total_deductions: number;
  taxable_income: number;
  final_tax: number;
}

export interface FilingSnapshot {
  id: number;
  year: number;
  confirmed_at: string;
  figures: FilingSnapshotFigures;
}

export type FilingSubmissionKind = "income" | "consumption";

export interface FilingSubmission {
  year: number;
  kind: FilingSubmissionKind;
  acceptance_number: string;
  submitted_date: string | null;
  receipt: { file_id: string; mime_type: string } | null;
  updated_at: string;
}

export interface FilingSubmissionHistoryEntry {
  id: number;
  year: number;
  kind: FilingSubmissionKind;
  action: string;
  before: FilingSubmission | null;
  after: FilingSubmission | null;
  created_at: string;
}

/* ---------- 納税者・e-Tax 出力 ---------- */

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
  user_id: string;
  occupation: string;
  shop_name: string;
  jan1_address: string;
  invoice_number: string;
  previous_zip_code: string;
  previous_address: string;
}

export interface TaxpayerProfileResult {
  taxpayer: XtxTaxpayerInput;
  carried_from: number | null;
}

export interface ExportXtxRequest {
  year: number;
  amendment: boolean;
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
  transactions: Transaction[];
  deductions: unknown;
  tax_credits: unknown;
  misc_income?: { revenue: number; income: number; kubun: number };
  salary_income?: { revenue: number };
  filing_type?: FilingType;
  real_estate_business_scale?: boolean;
  withholding_tax: number;
  prepaid_tax: number;
  original_third_period_tax: number | null;
  balance_sheet?: unknown;
  expanded_income?: unknown;
  agriculture?: unknown;
}

export interface ExportXtxResponse {
  filename: string;
  xtx: string;
  xsd_warning: string | null;
}

export interface ExportReturnPdfResponse {
  filename: string;
  pdf_base64: string;
}

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

export interface ExportConsumptionXtxResponse {
  filename: string;
  xtx: string;
  total_payable: number;
  xsd_warning: string | null;
}

/* ---------- 開業届・青色申告承認申請書 ---------- */

export type BusinessStartIncomeType = "real_estate" | "forest" | "business";
export type BookkeepingMethod = "double" | "simple" | "other";

export interface SalarySituationRow {
  count: number | null;
  terms: string;
  has_tax: boolean | null;
}

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
  blue_start_year: number;
  offices: { name: string; location: string }[];
  blue_cancellation_has: boolean | null;
  blue_cancellation_date: string;
  inheritance_has: boolean | null;
  inheritance_date: string;
  predecessor_name: string;
  bookkeeping: BookkeepingMethod | null;
  bookkeeping_other: string;
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

export interface BusinessStartInputsResponse {
  state: BusinessStartInputs | null;
  updated_at: string | null;
}

export interface ExportBusinessStartPdfRequest {
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
  inputs: BusinessStartInputs;
}

export interface ExportBusinessStartPdfResponse {
  filename: string;
  pdf_base64: string;
}

/* ---------- 請求書 ---------- */

export type InvoiceTaxRounding = "floor" | "round" | "ceil";
export type InvoicePaymentKind = "payment" | "fee" | "discount" | "overpayment";
export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";

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

export interface InvoiceIssuerRecord {
  name: string;
  zip_code: string;
  address: string;
  invoice_number: string;
}

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
  payment_status: InvoicePaymentStatus | null;
  settled_amount: number;
  remaining_amount: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineInput {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate_percent: number;
  is_reduced_rate: boolean;
}

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

export interface InvoiceSearchFilters {
  q?: string;
  from?: string;
  to?: string;
  min_total?: number;
  max_total?: number;
  status?: "draft" | "issued";
}

export interface InvoiceSettlementRecord {
  total_amount: number;
  settled_amount: number;
  remaining_amount: number;
  overpaid_amount: number;
  status: InvoicePaymentStatus;
}

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

export interface CreateInvoicePaymentInput {
  transaction_id: number;
  amount?: number;
  fee_amount?: number;
  discount_amount?: number;
  treat_excess_as_deposit?: boolean;
}

export type ReconciliationReason =
  | "amount_exact"
  | "amount_partial"
  | "name_match"
  | "date_close";

export interface ReconciliationCandidateRecord {
  transaction: LedgerTransaction;
  unapplied_amount: number;
  suggested_amount: number;
  score: number;
  reasons: ReconciliationReason[];
}

/* ---------- 設定・MCP・AI ---------- */

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKeyItem {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  status: ApiKeyStatus;
  created_at: string;
}

export interface CreatedApiKey extends ApiKeyItem {
  key: string;
}

export interface McpInfo {
  endpoint_path: string;
  tool_count: number;
  tools: { name: string; description: string }[];
}

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

export interface AgentTestResult {
  ok: boolean;
  model: string | null;
  reply: string | null;
  error: string | null;
}

export interface RegexRuleItem {
  pattern: string;
  category: string;
}

export interface RegexRulesInfo {
  customRules: RegexRuleItem[];
  usingCustom: boolean;
  generatedRules: Array<RegexRuleItem & { count: number; example: string }>;
  effectiveRules: RegexRuleItem[];
}

export interface JevPromptInfo {
  customPrompt: string;
  generatedPrompt: string;
  effectivePrompt: string;
}

/* ---------- エージェントチャット ---------- */

export interface ChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatAttachmentRef {
  name: string;
  mimeType: string;
}

export interface ChatAttachmentUpload extends ChatAttachmentRef {
  dataBase64?: string;
  text?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ChatToolCall[];
  attachments?: ChatAttachmentRef[];
}

export interface AgentChatResponse {
  reply: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result: unknown }>;
  error?: string;
}

export interface AgentConnectionConfig {
  baseUrl: string;
  model: string;
  apiKey: <redacted>
}
