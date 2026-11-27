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
import { AgentChatAttachment, toModelMessages } from "./agentAttachments";
import { createAgentTools } from "./agentAiTools";
import { AgentContext, SYSTEM_PROMPT, ToolCallLog } from "./agentTools";

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallLog[];
}

/** 1ターンで LLM を呼ぶ回数の上限（ツール呼び出しの無限ループ防止）。 */
export const MAX_TOOL_STEPS = 10;

/**
 * 1ターン全体の制限時間。上流の LLM が応答しないままリクエストを
 * 抱え続けないよう打ち切る。サーバーの idleTimeout（上限 255 秒）より
 * 短くし、接続を切られる前にエラーとして返す。
 */
const AGENT_TURN_TIMEOUT_MS = 240_000;

/** ツール呼び出しの上限で打ち切られ、応答文が無かったときに返す文。 */
export const STEP_LIMIT_REPLY =
  "ツールの呼び出しが上限に達したため、回答をまとめられませんでした。質問を分けてもう一度お試しください。";

/**
 * 1ターンの応答文。上限まで回って最後のステップもツール呼び出しで
 * 終わった場合、SDK の text は空になるため、打ち切ったことを伝える文にする。
 */
export function turnReply(text: string, stepCount: number): string {
  if (text.trim() !== "" || stepCount < MAX_TOOL_STEPS) return text;
  return STEP_LIMIT_REPLY;
}

/**
 * エージェントの1ターンを実行する。
 * LLM がツールを要求する限り SDK が実行して結果を返し、最終応答を返す。
 */
export async function runAgentTurn(
  cfg: AgentConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: AgentContext,
  attachments: AgentChatAttachment[] = [],
): Promise<AgentTurnResult> {
  const toolCalls: ToolCallLog[] = [];
  const result = await generateText({
    model: createAgentModel(cfg),
    system: SYSTEM_PROMPT,
    messages: toModelMessages(history, attachments),
    tools: createAgentTools(ctx, toolCalls),
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    abortSignal: AbortSignal.timeout(AGENT_TURN_TIMEOUT_MS),
  });
  return { reply: turnReply(result.text, result.steps.length), toolCalls };
}
