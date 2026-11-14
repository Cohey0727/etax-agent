/**
 * runAgentTurn.ts — 対話エージェントの1ターンを回す（services/agent）。
 *
 * 1回のユーザー発話に対して、ツール呼び出しが尽きるまでループを回す
 * （Python 版 run_agent の1ターン分に相当）。履歴は呼び出し側が毎回送る。
 */
import { ChatMessage, createLlmClient } from "../../gateways/llmGateway";
import { AgentConfig } from "../../lib/config";
import { AgentContext, SYSTEM_PROMPT, ToolCallLog, agentTools, dispatchTool } from "./agentTools";

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallLog[];
}

/**
 * エージェントの1ターンを実行する。
 * LLM がツールを要求する限り実行して結果を返し、最終応答を返す。
 */
export async function runAgentTurn(
  cfg: AgentConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: AgentContext,
): Promise<AgentTurnResult> {
  const client = createLlmClient(cfg);
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const m of history) messages.push({ role: m.role, content: m.content });

  const toolCalls: ToolCallLog[] = [];
  for (let i = 0; i < 10; i++) {
    // 無限ループ防止（Python 版と同値）
    const resp = await client.chat(messages, agentTools);
    const calls = resp.toolCalls ?? [];
    const assistantMsg: ChatMessage = { role: "assistant", content: resp.content || "" };
    if (calls.length > 0) assistantMsg.tool_calls = calls;
    messages.push(assistantMsg);
    if (calls.length === 0) {
      return { reply: resp.content || "", toolCalls };
    }
    for (const tc of calls) {
      const result = dispatchTool(tc.name, tc.arguments ?? {}, ctx);
      toolCalls.push({ name: tc.name, arguments: tc.arguments ?? {}, result });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(result),
      });
    }
  }
  return { reply: "ツール呼び出しが上限（10回）に達したため中断しました。", toolCalls };
}
