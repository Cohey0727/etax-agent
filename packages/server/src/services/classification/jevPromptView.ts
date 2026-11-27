/**
 * jevPromptView.ts — jev 用プロンプトの組み立て（services/classification）。
 *
 * カスタム（手編集）・自動生成・実効プロンプトをまとめた表示用データを返す。
 * MCP とエージェントの設定ツールで共有する。
 */
import { getJevPromptOverride } from "../../lib/config";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { JevPromptResponse } from "../../schemas/classify";
import { generateRules } from "./generateRules";

/** jev 用プロンプト（カスタム／自動生成／実効）を組み立てる。 */
export async function buildJevPromptView(): Promise<JevPromptResponse> {
  const history = await loadClassificationHistory();
  const customPrompt = getJevPromptOverride();
  const generatedPrompt = generateRules(history).jevPrompt;
  return { customPrompt, generatedPrompt, effectivePrompt: customPrompt || generatedPrompt };
}
