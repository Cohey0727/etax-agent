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
