/**
 * agentSettingsTools.test.ts — 対話エージェントの設定系ツールの検証。
 * 設定画面（REST）と同じ入力上限がエージェント経由でも効くことを担保する。
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJevPromptOverride, setJevPromptOverride } from "../src/lib/config";
import {
  setClassificationRulesForAgent,
  setJevPromptForAgent,
} from "../src/services/agent/agentSettingsTools";

beforeEach(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-agent-settings-"));
  setJevPromptOverride("");
});

describe("エージェントの設定ツールの入力上限", () => {
  test("8000文字を超えるプロンプトは保存しない", async () => {
    await expect(setJevPromptForAgent("あ".repeat(8001))).rejects.toThrow("8000");
    expect(getJevPromptOverride()).toBe("");
  });

  test("500件を超える正規表現ルールは保存しない", async () => {
    const rules = Array.from({ length: 501 }, (_, i) => ({ pattern: `店${i}`, category: "雑費" }));
    await expect(setClassificationRulesForAgent(rules)).rejects.toThrow("500件");
  });
});
