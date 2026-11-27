/**
 * agentUiActions.test.ts — エージェントのツール実行結果から導く画面操作の検証。
 *
 * 担保すること:
 * - 帳簿を書き換えるツールが成功したら、画面の取引に加えて、帳簿を自前で持つ画面
 *   （帳簿・領収書の紐付け候補）を読み直させる
 * - 読み直しは影響する画面に限る（設定画面の下書きを、申告ステータスの変更で捨てない）
 * - 失敗したツールでは何もしない
 */
import { describe, expect, test } from "bun:test";
import { deriveUiActions } from "../src/components/organisms/agent/AgentChatPanel/agentChatHelpers";
import { AppView } from "../src/types";

describe("deriveUiActions", () => {
  test("帳簿の書き込みが成功したら、帳簿と領収書の画面を読み直させる", () => {
    expect(
      deriveUiActions([{ name: "update_transactions", arguments: {}, result: { ok: true } }]),
    ).toEqual([
      { type: "reloadTransactions" },
      { type: "reloadView", view: AppView.Ledger },
      { type: "reloadView", view: AppView.Receipt },
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
      { type: "navigate", view: AppView.Filing },
      { type: "reloadView", view: AppView.Filing },
    ]);
  });

  test("設定の書き込みは設定画面だけを読み直させる", () => {
    expect(
      deriveUiActions([{ name: "set_jev_prompt", arguments: {}, result: { ok: true } }]),
    ).toEqual([{ type: "reloadView", view: AppView.Settings }]);
  });
});
