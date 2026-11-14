import { Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AnalyzeReceiptResponse,
  ChatMessage,
  FreeeTrialBalance,
  ImportCsvResponse,
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

/** 領収書画像を読み取り、科目判定まで済んだ帳簿ドラフトを返す。 */
export async function analyzeReceiptImage(file: File): Promise<AnalyzeReceiptResponse> {
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
