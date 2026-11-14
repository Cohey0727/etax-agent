import { Transaction } from "@etax/shared";

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

/** 帳簿（DB）に保存された取引1件。サーバーAPIのワイヤ形式（snake_case）。 */
export interface LedgerTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
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
  description: string;
  amount: number;
  account: string;
  category: string;
  income_type: string;
}
