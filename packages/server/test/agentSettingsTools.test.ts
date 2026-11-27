/**
 * agentSettingsTools.test.ts — 対話エージェントの設定系ツールの検証。
 * 設定画面（REST）と同じ入力上限がエージェント経由でも効くことを担保する。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { getJevPromptOverride, setJevPromptOverride } from "../src/lib/config";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  emptyTaxpayerProfile,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
  upsertTaxpayerProfileRow,
} from "../src/repositories/taxpayerRepository";
import { createUser } from "../src/repositories/userRepository";
import {
  setClassificationRulesForAgent,
  setJevPromptForAgent,
  updateTaxpayerProfileForAgent,
} from "../src/services/agent/agentSettingsTools";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

const sharedDataDir = process.env.ETAX_DATA_DIR;

beforeEach(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-agent-settings-"));
  setJevPromptOverride("");
});

// テストごとの空のデータフォルダから、preload が用意した共通のフォルダへ戻す
// （後に流れる他のテストファイルが fonts/ などを読めるように）。
afterEach(() => {
  process.env.ETAX_DATA_DIR = sharedDataDir;
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

describe("updateTaxpayerProfileForAgent", () => {
  test("マスクして渡した項目を空文字で書き戻しても、保存値は消えない", async () => {
    const db = await createTestDb();
    const userId = (await createUser(db, "agent-profile@example.com", "password-123")).id;
    await runWithTenant(userId, async () => {
      await upsertTaxpayerProfileRow(db, 2025, {
        ...emptyTaxpayerProfile(),
        name: "山田太郎",
        my_number: "123456789012",
        user_id: "1234567890123456",
      });
      await updateTaxpayerProfileForAgent(2025, { name: "山田花子", my_number: "", user_id: "" });
      const row = await getTaxpayerProfileRow(db, 2025);
      if (!row) throw new Error("納税者プロフィールが保存されていません");
      const saved = taxpayerProfileToApi(row);
      expect(saved.name).toBe("山田花子");
      expect(saved.my_number).toBe("123456789012");
      expect(saved.user_id).toBe("1234567890123456");
    });
  });
});
