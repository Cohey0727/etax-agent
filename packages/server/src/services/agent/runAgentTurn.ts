/**
 * runAgentTurn.ts — 対話エージェントの1ターンを回す（services/agent）。
 *
 * 会話制御（ツール呼び出しのループ）は Vercel AI SDK の generateText に任せる。
 * 履歴は呼び出し側が毎回送る（HTTP はステートレス）。ツール実行の記録は
 * 画面操作の導出に使うため ToolCallLog として返す。
 */
import { generateText, stepCountIs } from "ai";
import { createAgentModel } from "../../gateways/agentModelGateway";
import { AgentConfig } from "../../lib/config";
import { createAgentTools } from "./agentAiTools";
import { AgentContext, SYSTEM_PROMPT, ToolCallLog } from "./agentTools";

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallLog[];
}

/** ツール呼び出しの上限（無限ループ防止、手書きループ時代と同値）。 */
const MAX_TOOL_STEPS = 10;

/**
 * エージェントの1ターンを実行する。
 * LLM がツールを要求する限り SDK が実行して結果を返し、最終応答を返す。
 */
export async function runAgentTurn(
  cfg: AgentConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: AgentContext,
): Promise<AgentTurnResult> {
  const toolCalls: ToolCallLog[] = [];
  const result = await generateText({
    model: createAgentModel(cfg),
    system: SYSTEM_PROMPT,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    tools: createAgentTools(ctx, toolCalls),
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  });
  return { reply: result.text, toolCalls };
}
