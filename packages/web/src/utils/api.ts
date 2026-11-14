import { Transaction } from "@etax/shared";
import { AgentChatResponse, ChatMessage, ImportCsvResponse } from "@types";

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
