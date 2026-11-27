/**
 * ledger.ts — 帳簿（DB保存の取引）と科目判定のAPI。
 * 画面共通の Transaction（@etax/shared）との変換もここに置く。
 */
import { IncomeType, Transaction } from "@etax/shared";
import { apiJson, apiJsonOrNull, LONG_TIMEOUT_MS } from "./client";
import {
  AccountClassification,
  ImportCsvResponse,
  LedgerTransaction,
  LedgerTransactionInput,
  TransactionHistoryEntry,
} from "./types";

/** 帳簿の行を画面共通の Transaction へ変換する。 */
export function ledgerRowToTransaction(row: LedgerTransaction): Transaction {
  const incomeType: IncomeType =
    row.income_type === "business" || row.income_type === "real_estate"
      ? row.income_type
      : "other";
  return {
    date: row.date,
    year: row.fiscal_year || Number(row.date.slice(0, 4)),
    description: row.description,
    amount: row.amount,
    account: row.account,
    category: row.category,
    income_type: incomeType,
    tax_category: row.tax_category ?? "",
    business_ratio_percent:
      typeof row.business_ratio_percent === "number" ? row.business_ratio_percent : undefined,
    business_ratio_basis: row.business_ratio_basis ?? undefined,
  };
}

/** 画面共通の Transaction を帳簿保存用の入力へ変換する。 */
export function transactionToLedgerInput(tx: Transaction): LedgerTransactionInput {
  return {
    date: tx.date,
    fiscal_year: tx.year,
    description: tx.description,
    amount: tx.amount,
    account: tx.account,
    category: tx.category,
    income_type: tx.income_type,
    tax_category: tx.tax_category,
    business_ratio_percent: tx.business_ratio_percent ?? 100,
    business_ratio_basis: tx.business_ratio_basis ?? "",
  };
}

/** 帳簿の取引を取得する。year 省略時は全件。DB未接続の場合は null。 */
export async function fetchLedgerTransactions(
  year?: number,
): Promise<LedgerTransaction[] | null> {
  const query = year ? `?year=${year}` : "";
  const data = await apiJsonOrNull<{ transactions: LedgerTransaction[] }>(
    `/api/transactions${query}`,
  );
  return data?.transactions ?? null;
}

/** 帳簿に取引を1件追加する。 */
export async function createLedgerTransaction(
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const data = await apiJson<{ transaction: LedgerTransaction | null }>("/api/transactions", {
    method: "POST",
    body: input,
  });
  if (!data.transaction) throw new Error("取引の登録に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件更新する。 */
export async function updateLedgerTransaction(
  id: number,
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const data = await apiJson<{ transaction: LedgerTransaction | null }>(
    `/api/transactions/${id}`,
    { method: "PUT", body: input },
  );
  if (!data.transaction) throw new Error("取引の更新に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件削除する。 */
export async function deleteLedgerTransaction(id: number): Promise<void> {
  await apiJson(`/api/transactions/${id}`, { method: "DELETE" });
}

/** 取引1件の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchTransactionHistory(
  transactionId: number,
): Promise<TransactionHistoryEntry[] | null> {
  const data = await apiJsonOrNull<{ history: TransactionHistoryEntry[] }>(
    `/api/transactions/${transactionId}/history`,
  );
  return data?.history ?? null;
}

/** 全取引の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchRecentTransactionHistory(
  limit = 100,
): Promise<TransactionHistoryEntry[] | null> {
  const data = await apiJsonOrNull<{ history: TransactionHistoryEntry[] }>(
    `/api/transactions/history?limit=${limit}`,
  );
  return data?.history ?? null;
}

/** 1年分の取引を丸ごと帳簿へ保存する（置き換え）。 */
export async function replaceYearLedgerTransactions(
  year: number,
  inputs: LedgerTransactionInput[],
): Promise<LedgerTransaction[]> {
  const data = await apiJson<{ transactions: LedgerTransaction[] }>(
    "/api/transactions/replace-year",
    { method: "POST", body: { year, transactions: inputs } },
  );
  return data.transactions;
}

/** CSVファイルを生バイトのまま送る（文字コードのデコードはサーバー側）。 */
export async function importCsvBytes(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string,
): Promise<ImportCsvResponse> {
  return apiJson<ImportCsvResponse>("/api/import/csv", {
    method: "POST",
    rawBody: bytes,
    contentType: "text/csv",
    headers: { "X-Filename": encodeURIComponent(filename) },
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

/** 勘定科目を1件判定する（履歴→SystemOne→ルール）。 */
export async function classifyAccount(description: string): Promise<AccountClassification> {
  return apiJson<AccountClassification>("/api/classify/account", {
    method: "POST",
    body: { description },
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

/** 勘定科目をまとめて判定する。 */
export async function classifyAccountsBatch(
  descriptions: string[],
): Promise<AccountClassification[]> {
  const data = await apiJson<{ results: AccountClassification[] }>("/api/classify/batch", {
    method: "POST",
    body: { items: descriptions.map((description) => ({ description })) },
    timeoutMs: LONG_TIMEOUT_MS,
  });
  return data.results;
}

/** 確定した科目を学習履歴に記録する。 */
export async function recordClassificationFeedback(
  description: string,
  account: string,
): Promise<void> {
  await apiJsonOrNull("/api/classify/feedback", {
    method: "POST",
    body: { description, account },
  });
}
