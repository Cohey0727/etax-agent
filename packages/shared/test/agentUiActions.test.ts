/**
 * agentUiActions.test.ts — エージェントのツール実行結果から導く画面操作の検証。
 *
 * 担保すること:
 * - 帳簿を書き換えるツールが成功したら、画面の取引に加えて、帳簿を自前で持つ画面
 *   （帳簿・領収書の紐付け候補）を読み直させる
 * - 読み直しは影響する画面に限る（設定画面の下書きを、申告ステータスの変更で捨てない）
 * - 失敗したツールでは何もしない
 * - ツール名の表示名と、会話履歴の日時（端末の時刻）・抜粋を Web と native で同じにする
 */
import { describe, expect, test } from "bun:test";
import {
  AgentScreen,
  agentToolLabel,
  chatSessionExcerpt,
  deriveUiActions,
  formatChatSessionDate,
} from "../src/index";

describe("deriveUiActions", () => {
  test("帳簿の書き込みが成功したら、帳簿と領収書の画面を読み直させる", () => {
    expect(
      deriveUiActions([{ name: "update_transactions", arguments: {}, result: { ok: true } }]),
    ).toEqual([
      { type: "reloadTransactions" },
      { type: "reloadView", screen: AgentScreen.Ledger },
      { type: "reloadView", screen: AgentScreen.Receipt },
    ]);
  });

  test("失敗した書き込みでは何もしない", () => {
    expect(
      deriveUiActions([{ name: "delete_transaction", arguments: {}, result: { error: "x" } }]),
    ).toEqual([]);
  });

  test("申告ステータスの変更は確定申告画面だけを読み直させる", () => {
    expect(
      deriveUiActions([{ name: "set_filing_status", arguments: {}, result: { ok: true } }]),
    ).toEqual([
      { type: "navigate", screen: AgentScreen.Filing },
      { type: "reloadView", screen: AgentScreen.Filing },
    ]);
  });

  test("設定の書き込みは設定画面だけを読み直させる", () => {
    expect(
      deriveUiActions([{ name: "set_jev_prompt", arguments: {}, result: { ok: true } }]),
    ).toEqual([{ type: "reloadView", screen: AgentScreen.Settings }]);
  });
});

describe("deriveUiActions（遷移と年度）", () => {
  test("集計は対象年へ切り替えてダッシュボードへ移る", () => {
    expect(deriveUiActions([{ name: "aggregate_year", arguments: { year: 2024 } }])).toEqual([
      { type: "setYear", year: 2024 },
      { type: "navigate", screen: AgentScreen.Dashboard },
    ]);
  });

  test("控除の変更は適用してから確定申告画面へ移る", () => {
    const patch = { deductions: { socialInsurancePaid: 140080 } };
    expect(
      deriveUiActions([
        { name: "set_deductions", arguments: {}, result: { ok: true, applied: "deductions", year: 2025, patch } },
      ]),
    ).toEqual([
      { type: "applyDeductions", year: 2025, patch },
      { type: "navigate", screen: AgentScreen.Filing },
    ]);
  });

  test("同じ操作は1ターンに1回だけ", () => {
    expect(
      deriveUiActions([
        { name: "add_transaction", arguments: {}, result: { ok: true } },
        { name: "update_transactions", arguments: {}, result: { ok: true } },
      ]),
    ).toHaveLength(3);
  });

  test("テーマは light / dark / system のときだけ切り替える", () => {
    expect(deriveUiActions([{ name: "set_theme", arguments: { mode: "dark" } }])).toEqual([
      { type: "setTheme", mode: "dark" },
    ]);
    expect(deriveUiActions([{ name: "set_theme", arguments: { mode: "sepia" } }])).toEqual([]);
  });
});

describe("チャットの表示", () => {
  test("ツール名の表示名（ラベルの無いツールは名前のまま）", () => {
    expect(agentToolLabel("get_taxpayer_profile")).toBe("納税者情報を確認");
    expect(agentToolLabel("update_systemone_settings")).toBe("科目判定AIの設定を保存");
    expect(agentToolLabel("unknown_tool")).toBe("unknown_tool");
  });

  test("会話履歴の日時は端末の時刻で YYYY/MM/DD HH:mm にする", () => {
    const saved = new Date(2026, 10, 28, 8, 5);
    expect(formatChatSessionDate(saved.toISOString())).toBe("2026/11/28 08:05");
    expect(formatChatSessionDate("not-a-date")).toBe("not-a-date");
  });

  test("抜粋は最初の質問の改行を空白にし、42文字で切る", () => {
    const question = "一行目\n" + "あ".repeat(50);
    expect(
      chatSessionExcerpt([
        { role: "assistant", content: "こんにちは" },
        { role: "user", content: question },
      ]),
    ).toBe(`一行目 ${"あ".repeat(38)}…`);
    expect(chatSessionExcerpt([{ role: "assistant", content: "回答だけ" }])).toBe("回答だけ");
    expect(chatSessionExcerpt([])).toBe("");
  });
});
