/**
 * invoice.test.ts — 請求書の金額計算（税率ごとの集計と端数処理）の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  computeInvoiceTotals,
  invoiceLineAmount,
  InvoiceLineInput,
} from "../src/invoice";

const line = (partial: Partial<InvoiceLineInput>): InvoiceLineInput => ({
  itemName: "品目",
  quantity: 1,
  unit: "",
  unitPrice: 0,
  taxRatePercent: 10,
  isReducedRate: false,
  ...partial,
});

describe("請求書の金額計算", () => {
  test("明細金額は数量×単価で、円未満は切り捨てる", () => {
    expect(invoiceLineAmount(line({ quantity: 3, unitPrice: 7000 }))).toBe(21000);
    expect(invoiceLineAmount(line({ quantity: 1.5, unitPrice: 333 }))).toBe(499);
  });

  test("消費税額の端数処理は税率ごとに1回だけ（明細ごとには丸めない）", () => {
    // 98円×3行を明細ごとに丸めると 9円×3=27円になるが、正しくは
    // 税率ごとの合計 294円 × 10% = 29.4 → 29円（切捨て）。
    const lines = [
      line({ unitPrice: 98 }),
      line({ unitPrice: 98 }),
      line({ unitPrice: 98 }),
    ];
    const totals = computeInvoiceTotals(lines, "floor");
    expect(totals.groups).toEqual([{ taxRatePercent: 10, subtotal: 294, tax: 29 }]);
    expect(totals.subtotal).toBe(294);
    expect(totals.taxTotal).toBe(29);
    expect(totals.total).toBe(323);
  });

  test("複数税率は税率ごとに区分して集計する", () => {
    const lines = [
      line({ unitPrice: 10000, taxRatePercent: 10 }),
      line({ unitPrice: 1000, taxRatePercent: 8, isReducedRate: true }),
      line({ unitPrice: 500, taxRatePercent: 0 }),
    ];
    const totals = computeInvoiceTotals(lines, "floor");
    expect(totals.groups).toEqual([
      { taxRatePercent: 10, subtotal: 10000, tax: 1000 },
      { taxRatePercent: 8, subtotal: 1000, tax: 80 },
      { taxRatePercent: 0, subtotal: 500, tax: 0 },
    ]);
    expect(totals.subtotal).toBe(11500);
    expect(totals.taxTotal).toBe(1080);
    expect(totals.total).toBe(12580);
  });

  test("端数処理の方法を切り替えられる", () => {
    const lines = [line({ unitPrice: 995 })];
    expect(computeInvoiceTotals(lines, "floor").taxTotal).toBe(99);
    expect(computeInvoiceTotals(lines, "round").taxTotal).toBe(100);
    expect(computeInvoiceTotals(lines, "ceil").taxTotal).toBe(100);
    const half = [line({ unitPrice: 985 })];
    expect(computeInvoiceTotals(half, "floor").taxTotal).toBe(98);
    expect(computeInvoiceTotals(half, "round").taxTotal).toBe(99);
    expect(computeInvoiceTotals(half, "ceil").taxTotal).toBe(99);
  });

  test("明細が無ければすべて0", () => {
    const totals = computeInvoiceTotals([], "floor");
    expect(totals).toEqual({ groups: [], subtotal: 0, taxTotal: 0, total: 0 });
  });
});
