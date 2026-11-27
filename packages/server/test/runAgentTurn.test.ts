/**
 * runAgentTurn.test.ts — エージェントの1ターンの応答文の検証。
 * ツール呼び出しの上限で打ち切られたときに、空の応答を返さないことを担保する。
 */
import { describe, expect, test } from "bun:test";
import { MAX_TOOL_STEPS, STEP_LIMIT_REPLY, turnReply } from "../src/services/agent/runAgentTurn";

describe("turnReply", () => {
  test("応答文があればそのまま返す", () => {
    expect(turnReply("集計しました。", MAX_TOOL_STEPS)).toBe("集計しました。");
  });

  test("上限まで回って応答文が空なら、打ち切ったことを伝える", () => {
    expect(turnReply("", MAX_TOOL_STEPS)).toBe(STEP_LIMIT_REPLY);
    expect(turnReply("  ", MAX_TOOL_STEPS)).toBe(STEP_LIMIT_REPLY);
  });

  test("上限前に終わった空の応答は変えない", () => {
    expect(turnReply("", 2)).toBe("");
  });
});
