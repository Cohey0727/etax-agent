/**
 * ledgerDraft.test.ts — 帳簿の入力中の値（金額・事業割合は空欄を持てる）を、
 * 保存する取引入力へ変換するときの検証。
 *
 * 担保すること:
 * - 金額・事業割合の欄が空のまま（入力途中の「-」を含む）なら保存しない
 * - 入力欄の数値（valueAsNumber）は、数として読めないとき空欄として持つ
 */
import { describe, expect, test } from "bun:test";
import {
  emptyDraft,
  inputNumberOrNull,
  ledgerDraftToInput,
} from "../src/components/organisms/ledger/LedgerPanel/ledgerOptions";

const filled = () => ({
  ...emptyDraft(2025),
  date: "2025-04-01",
  description: "サーバー利用料",
  amount: -1200,
});

describe("ledgerDraftToInput", () => {
  test("新しい下書きの金額は空欄", () => {
    expect(emptyDraft(2025).amount).toBeNull();
  });

  test("埋まった下書きは取引入力になる", () => {
    expect(ledgerDraftToInput(filled())).toEqual({
      input: {
        date: "2025-04-01",
        fiscal_year: 2025,
        description: "サーバー利用料",
        amount: -1200,
        account: "手入力",
        category: "未分類",
        income_type: "business",
        tax_category: "",
        business_ratio_percent: 100,
        business_ratio_basis: "",
      },
    });
  });

  test("金額が空欄・0 なら保存しない", () => {
    expect(ledgerDraftToInput({ ...filled(), amount: null })).toEqual({
      error: "金額を入力してください（支出はマイナス）",
    });
    expect(ledgerDraftToInput({ ...filled(), amount: 0 })).toEqual({
      error: "金額を入力してください（支出はマイナス）",
    });
  });

  test("事業割合が空欄・範囲外なら保存しない", () => {
    expect(ledgerDraftToInput({ ...filled(), business_ratio_percent: null })).toEqual({
      error: "事業割合は0〜100の整数で入力してください",
    });
    expect(ledgerDraftToInput({ ...filled(), business_ratio_percent: 120 })).toEqual({
      error: "事業割合は0〜100の整数で入力してください",
    });
  });

  test("日付・摘要の抜けは先に知らせる", () => {
    expect(ledgerDraftToInput({ ...filled(), date: "" })).toEqual({ error: "日付を入力してください" });
    expect(ledgerDraftToInput({ ...filled(), description: " " })).toEqual({
      error: "摘要を入力してください",
    });
  });
});

describe("inputNumberOrNull", () => {
  test("数として読めない入力（「-」だけ・空欄）は null", () => {
    expect(inputNumberOrNull(Number.NaN)).toBeNull();
    expect(inputNumberOrNull(-1200)).toBe(-1200);
    expect(inputNumberOrNull(0)).toBe(0);
  });
});
