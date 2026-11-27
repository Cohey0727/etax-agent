/**
 * agentTaxpayerMask.test.ts — エージェント向け納税者プロフィールの
 * マイナンバーマスク検証（Issue #7）。外部 LLM とツールログへ
 * マイナンバーの値が渡らないことを確認する。
 */
import { describe, expect, test } from "bun:test";
import { taxpayerProfileForAgent } from "../src/services/agent/agentSettingsTools";
import { emptyTaxpayerProfile } from "../src/repositories/taxpayerRepository";

describe("taxpayerProfileForAgent", () => {
  test("マイナンバーは値が落ち、登録有無だけが残る", () => {
    const profile = { ...emptyTaxpayerProfile(), name: "山田太郎", my_number: "123456789012" };
    const view = taxpayerProfileForAgent(profile);
    expect(view.my_number).toBe("");
    expect(view.my_number_registered).toBe(true);
    expect(view.name).toBe("山田太郎");
    expect(JSON.stringify(view)).not.toContain("123456789012");
  });

  test("未登録なら my_number_registered は false", () => {
    const view = taxpayerProfileForAgent(emptyTaxpayerProfile());
    expect(view.my_number).toBe("");
    expect(view.my_number_registered).toBe(false);
  });

  test("利用者識別番号も値が落ち、登録有無だけが残る", () => {
    const profile = { ...emptyTaxpayerProfile(), user_id: "1234567890123456" };
    const view = taxpayerProfileForAgent(profile);
    expect(view.user_id).toBe("");
    expect(view.user_id_registered).toBe(true);
    expect(JSON.stringify(view)).not.toContain("1234567890123456");
    expect(taxpayerProfileForAgent(emptyTaxpayerProfile()).user_id_registered).toBe(false);
  });
});
