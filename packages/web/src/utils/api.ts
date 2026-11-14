import { IncomeType, Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AnalyzeReceiptResponse,
  ChatMessage,
  FreeeTrialBalance,
  ImportCsvResponse,
  LedgerTransaction,
  LedgerTransactionInput,
  ListLedgerTransactionsResponse,
  PresignUploadFileResponse,
} from "@types";

/** サーバーAPIの型つきラッパー。/api は Vite プロキシで localhost:3001 へ。 */

async function parseJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  return data;
}

/** CSVファイルを生バイトのまま送る（Shift_JISのデコードはサーバー側）。 */
export async function importCsvFile(file: File): Promise<ImportCsvResponse> {
  const buf = await file.arrayBuffer();
  const resp = await fetch("/api/import/csv", {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "X-Filename": encodeURIComponent(file.name),
    },
    body: buf,
  });
  return parseJson<ImportCsvResponse>(resp);
}

export async function agentChat(
  messages: ChatMessage[],
  transactions: Transaction[],
): Promise<AgentChatResponse> {
  const resp = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, transactions }),
  });
  return parseJson<AgentChatResponse>(resp);
}

/** 勘定科目を1件判定する（履歴→SystemOne→ルール）。 */
export async function classifyAccount(description: string): Promise<AccountClassification> {
  const resp = await fetch("/api/classify/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return parseJson<AccountClassification>(resp);
}

/** 勘定科目をまとめて判定する（カード明細の行など）。 */
export async function classifyAccountsBatch(
  descriptions: string[],
): Promise<AccountClassification[]> {
  const resp = await fetch("/api/classify/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: descriptions.map((description) => ({ description })) }),
  });
  const data = await parseJson<{ results: AccountClassification[] }>(resp);
  return data.results;
}

/** 確定した科目を学習履歴に記録する（次回から「過去の傾向」で優先される）。 */
export async function recordClassificationFeedback(
  description: string,
  account: string,
): Promise<void> {
  await fetch("/api/classify/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, account }),
  }).catch(() => undefined);
}

const UPLOADABLE_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * 領収書画像を読み取り、科目判定まで済んだ帳簿ドラフトを返す。
 * 基本フロー: 署名付きURLでストレージ（Garage）へ直接アップロードし、
 * ファイルIDで解析を依頼する。ストレージが使えない場合は、画像を
 * Base64で直接渡す従来経路にフォールバックする。
 */
export async function analyzeReceiptImage(file: File): Promise<AnalyzeReceiptResponse> {
  if (UPLOADABLE_IMAGE_TYPES.includes(file.type)) {
    const viaStorage = await analyzeReceiptViaStorage(file).catch(() => null);
    if (viaStorage) return viaStorage;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  const resp = await fetch("/api/receipts/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
  });
  return parseJson<AnalyzeReceiptResponse>(resp);
}

/** 署名付きURLでアップロードし、ファイルIDで解析を依頼する経路。 */
async function analyzeReceiptViaStorage(file: File): Promise<AnalyzeReceiptResponse> {
  const presignResp = await fetch("/api/files/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  const presign = await parseJson<PresignUploadFileResponse>(presignResp);
  const uploadResp = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`ファイルのアップロードに失敗しました (HTTP ${uploadResp.status})`);
  }
  const resp = await fetch("/api/receipts/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: presign.fileId }),
  });
  return parseJson<AnalyzeReceiptResponse>(resp);
}

/** freee試算表（取り込み済みの実績データ）。未取り込みなら null。 */
export async function fetchFreeeTrialBalance(): Promise<FreeeTrialBalance | null> {
  try {
    const resp = await fetch("/api/freee/trial-balance");
    if (!resp.ok) return null;
    return (await resp.json()) as FreeeTrialBalance;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 帳簿（DB保存の取引）
// ---------------------------------------------------------------------------

/** 帳簿の行を画面共通の Transaction へ変換する。 */
export function ledgerRowToTransaction(row: LedgerTransaction): Transaction {
  const incomeType: IncomeType =
    row.income_type === "business" || row.income_type === "real_estate"
      ? row.income_type
      : "other";
  return {
    date: row.date,
    year: Number(row.date.slice(0, 4)),
    description: row.description,
    amount: row.amount,
    account: row.account,
    category: row.category,
    income_type: incomeType,
  };
}

/** 画面共通の Transaction を帳簿保存用の入力へ変換する。 */
export function transactionToLedgerInput(tx: Transaction): LedgerTransactionInput {
  return {
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    account: tx.account,
    category: tx.category,
    income_type: tx.income_type,
  };
}

/**
 * 帳簿の取引を取得する。year 省略時は全件。
 * 帳簿DBが未接続（503）の場合は null を返す（呼び出し側で未接続表示にする）。
 */
export async function fetchLedgerTransactions(
  year?: number,
): Promise<LedgerTransaction[] | null> {
  try {
    const query = year ? `?year=${year}` : "";
    const resp = await fetch(`/api/transactions${query}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as ListLedgerTransactionsResponse;
    return data.transactions;
  } catch {
    return null;
  }
}

/** 帳簿に取引を1件追加する。 */
export async function createLedgerTransaction(
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const resp = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ transaction: LedgerTransaction | null }>(resp);
  if (!data.transaction) throw new Error("取引の登録に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件更新する。 */
export async function updateLedgerTransaction(
  id: number,
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const resp = await fetch(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ transaction: LedgerTransaction | null }>(resp);
  if (!data.transaction) throw new Error("取引の更新に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件削除する。 */
export async function deleteLedgerTransaction(id: number): Promise<void> {
  const resp = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  await parseJson(resp);
}

/** 1年分の取引を丸ごと帳簿へ保存する（画面の確定状態で置き換える）。 */
export async function replaceYearLedgerTransactions(
  year: number,
  inputs: LedgerTransactionInput[],
): Promise<LedgerTransaction[]> {
  const resp = await fetch("/api/transactions/replace-year", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, transactions: inputs }),
  });
  const data = await parseJson<ListLedgerTransactionsResponse>(resp);
  return data.transactions;
}
