/**
 * agent.ts — エージェントチャットのAPI。取引と申告入力の現在値を渡し、
 * サーバー側のツール実行込みで応答を得る。
 */
import { Transaction } from "@etax/shared";
import { apiJson } from "./client";
import { AgentChatResponse, AgentConnectionConfig, ChatAttachmentUpload, ChatMessage } from "./types";

export interface AgentChatDeductions {
  year: number;
  state: unknown;
}

/** エージェントへ会話を送る。接続の上書きは入っている項目だけ送る。 */
export async function agentChat(
  messages: ChatMessage[],
  transactions: Transaction[],
  connection?: AgentConnectionConfig,
  deductions?: AgentChatDeductions,
  attachments?: ChatAttachmentUpload[],
): Promise<AgentChatResponse> {
  const agentConfig = {
    ...(connection?.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {}),
    ...(connection?.model.trim() ? { model: connection.model.trim() } : {}),
    ...(connection?.apiKey.trim() ? { apiKey: connection.apiKey.trim() } : {}),
  };
  return apiJson<AgentChatResponse>("/api/agent/chat", {
    method: "POST",
    body: {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      transactions,
      ...(deductions ? { deductions } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(Object.keys(agentConfig).length > 0 ? { agentConfig } : {}),
    },
  });
}
