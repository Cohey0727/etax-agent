/**
 * loadClassifyDeps.ts — 科目判定の依存の組み立て（services/classification）。
 *
 * 現在のテナントの学習履歴・判定モデルの接続設定・手編集のプロンプトと
 * 正規表現ルールから、classifyAccount に渡す依存を作る。MCP とエージェントの
 * 判定ツールで共有する。一括判定では1回だけ作って全件に使う。
 */
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import {
  getJevPromptOverride,
  getRegexRulesOverride,
  loadSystemOneConfig,
} from "../../lib/config";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { ClassifyAccountDeps } from "./classifyAccount";

/** 現在の設定で科目判定の依存を組み立てる。 */
export async function loadClassifyDeps(): Promise<ClassifyAccountDeps> {
  return {
    history: await loadClassificationHistory(),
    systemOne: createSystemOneClient(loadSystemOneConfig()),
    jevPromptOverride: getJevPromptOverride(),
    regexRulesOverride: getRegexRulesOverride(),
  };
}
