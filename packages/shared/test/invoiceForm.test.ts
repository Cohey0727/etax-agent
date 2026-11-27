/**
 * invoiceForm.test.ts — 請求書画面の入力の初期値・変換・検証・集計の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  emptyInvoiceInput,
  formatInvoiceQuantity,
  INVOICE_TAX_ROUNDING_OPTIONS,
  invoiceInputTotals,
  invoiceRecordToInput,
  validateInvoiceInput,
} from "../src/invoiceForm";

describe("emptyInvoiceInput", () => {
  test("発行日は日付、明細は1行、端数処理は切り捨て", () => {
    const input = emptyInvoiceInput();
    expect(input.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.lines).toHaveLength(1);
    expect(input.tax_rounding).toBe("floor");
  });
});

describe("invoiceRecordToInput", () => {
  test("保存済みの請求書から入力に無い項目を落とす", () => {
    const record = {
      ...emptyInvoiceInput(),
      id: 7,
      status: "draft",
      lines: [{ ...emptyInvoiceInput().lines[0]!, id: 3, amount: 0 }],
    };
    const input = invoiceRecordToInput(record);
    expect("id" in input).toBe(false);
    expect("id" in input.lines[0]!).toBe(false);
    expect(input.lines[0]?.quantity).toBe(1);
  });
});

describe("invoiceInputTotals", () => {
  test("税率ごとに1回だけ端数処理する", () => {
    const input = {
      ...emptyInvoiceInput(),
      lines: [
        { ...emptyInvoiceInput().lines[0]!, quantity: 1.5, unit_price: 10_001 },
        { ...emptyInvoiceInput().lines[0]!, quantity: 1, unit_price: 999 },
      ],
    };
    const totals = invoiceInputTotals(input);
    expect(totals.subtotal).toBe(15_001 + 999);
    expect(totals.taxTotal).toBe(1_600);
  });
});

describe("formatInvoiceQuantity / validateInvoiceInput / 選択肢", () => {
  test("小数の数量は末尾のゼロを落とす", () => {
    expect(formatInvoiceQuantity(2)).toBe("2");
    expect(formatInvoiceQuantity(1.5)).toBe("1.5");
    expect(formatInvoiceQuantity(0.3333333)).toBe("0.333");
  });

  test("数量 0・単価のマイナスは保存しない", () => {
    const base = emptyInvoiceInput();
    expect(validateInvoiceInput(base)).toBeNull();
    expect(validateInvoiceInput({ ...base, lines: [{ ...base.lines[0]!, quantity: 0 }] })).toBe(
      "数量は0より大きく入力してください",
    );
    expect(validateInvoiceInput({ ...base, lines: [] })).toBe("明細を1行以上入力してください");
  });

  test("端数処理の選択肢は切り捨て・四捨五入・切り上げの順", () => {
    expect(INVOICE_TAX_ROUNDING_OPTIONS.map((o) => o.label)).toEqual([
      "切り捨て",
      "四捨五入",
      "切り上げ",
    ]);
  });
});
