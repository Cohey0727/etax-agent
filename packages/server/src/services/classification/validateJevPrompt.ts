/**
 * validateJevPrompt.ts — jev 用プロンプト入力の検証（services/classification）。
 *
 * MCP とエージェントのツールから使う。プロンプトは判定のたびに判定モデルへ
 * 送られるため、長さに上限を置く。
 */

/** プロンプトの最大長。 */
export const MAX_JEV_PROMPT_LENGTH = 8000;

export type ValidateJevPromptResult = { ok: true } | { ok: false; message: string };

/** プロンプト入力を検証する。 */
export function validateJevPrompt(prompt: string): ValidateJevPromptResult {
  if (prompt.trim().length > MAX_JEV_PROMPT_LENGTH) {
    return { ok: false, message: `プロンプトは${MAX_JEV_PROMPT_LENGTH}文字以内で指定してください` };
  }
  return { ok: true };
}
