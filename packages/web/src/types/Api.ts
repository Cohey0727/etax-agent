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

export type ClassificationSource = "history" | "systemone" | "rules" | "none";

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
