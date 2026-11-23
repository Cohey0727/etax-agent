/**
 * regexRulesView.ts — 正規表現ルール一式の組み立て（services/classification）。
 *
 * カスタム（手編集）・自動生成・実効ルールをまとめた表示用データを返す。
 * 設定画面の取得/保存ユースケースと、エージェントの設定ツールで共有する。
 */
import { getRegexRulesOverride } from "../../lib/config";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { RegexRulesResponse } from "../../schemas/classify";
import { generateRules } from "./generateRules";

/** 正規表現ルール一式（カスタム／自動生成／実効）を組み立てる。 */
export async function buildRegexRulesView(): Promise<RegexRulesResponse> {
  const history = await loadClassificationHistory();
  const generatedRules = generateRules(history).regexRules;
  const customRules = getRegexRulesOverride() ?? [];
  const usingCustom = getRegexRulesOverride() !== null;
  return {
    customRules,
    usingCustom,
    generatedRules,
    effectiveRules: usingCustom ? customRules : generatedRules,
  };
}
