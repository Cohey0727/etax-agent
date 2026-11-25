/**
 * reconciliation.test.ts — 入金消込（Issue #17 Phase 1-2）の検証。
 * テスト用 PostgreSQL で、消込の集計・手動消込・差額調整（振込手数料／
 * 売上値引／過入金の預り金）・解除・候補推測を確認する。
 * 納税者情報・取引先は東京のダミー値を使う。
 */
import { describe, expect, test } from "bun:test";
import {
  computeInvoiceSettlement,
  suggestReconciliations,
} from "@etax/shared";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import {
  fetchInvoiceResponse,
  insertInvoice,
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import {
  appliedAmountsByTransaction,
  deleteReconciliation,
  fetchPaymentsResponse,
  insertReconciliation,
  settlementSummaries,
} from "../src/repositories/reconciliationRepository";
import {
  getTransactionRow,
  insertTransactionRow,
  listTransactionRows,
} from "../src/repositories/transactionRepository";
import { DocumentRow } from "../src/repositories/schema";

const header = (overrides: Partial<InvoiceHeaderDraft> = {}): InvoiceHeaderDraft => ({
  issue_date: "2026-04-01",
  due_date: "2026-04-30",
  counterparty_name: "株式会社サンプル",
  counterparty_address: "東京都港区芝公園4-2-8",
  is_qualified: true,
  tax_rounding: "floor",
  memo: "",
  ...overrides,
});

// 税込合計 78,080（10%: 70,000+税7,000、8%: 1,000+税80）
const lines: InvoiceLineDraft[] = [
  { item_name: "開発支援業務", quantity: 10, unit: "時間", unit_price: 7000, tax_rate_percent: 10, is_reduced_rate: false },
  { item_name: "食品サンプル", quantity: 2, unit: "個", unit_price: 500, tax_rate_percent: 8, is_reduced_rate: true },
];

async function issuedInvoice(db: Db, overrides: Partial<InvoiceHeaderDraft> = {}): Promise<DocumentRow> {
  const row = await insertInvoice(db, header(overrides), lines, null);
  const issued = await markInvoiceIssued(db, row!.id, "2026-0001", {
    name: "山田太郎",
    zip_code: "100-0001",
    address: "東京都千代田区千代田1-1",
    invoice_number: "T1234567890123",
  });
  return issued!;
}

async function incomeTransaction(
  db: Db,
  amount: number,
  description = "株式会社サンプル 振込",
  date = "2026-04-15",
) {
  const row = await insertTransactionRow(db, {
    date,
    fiscalYear: 2026,
    description,
    amount,
    account: "普通預金",
    category: "売上高",
    incomeType: "business",
    taxCategory: "",
    businessRatioPercent: 100,
    businessRatioBasis: "",
  });
  return row!;
}

describe("消込集計（shared）", () => {
  test("未消込・一部消込・消込済みと過入金の扱い", () => {
    expect(computeInvoiceSettlement(10000, []).status).toBe("unpaid");
    expect(
      computeInvoiceSettlement(10000, [{ kind: "payment", amount: 4000 }]),
    ).toMatchObject({ settledAmount: 4000, remainingAmount: 6000, status: "partial" });
    // 手数料・値引の調整も消込済みに数える
    expect(
      computeInvoiceSettlement(10000, [
        { kind: "payment", amount: 9500 },
        { kind: "fee", amount: 500 },
      ]).status,
    ).toBe("paid");
    // 過入金は消込済みに数えず、別枠で返す
    expect(
      computeInvoiceSettlement(10000, [
        { kind: "payment", amount: 10000 },
        { kind: "overpayment", amount: 2000 },
      ]),
    ).toMatchObject({ settledAmount: 10000, overpaidAmount: 2000, status: "paid" });
  });
});

describe("候補推測（shared）", () => {
  const invoice = {
    totalAmount: 78080,
    remainingAmount: 78080,
    counterpartyName: "株式会社サンプル",
    issueDate: "2026-04-01",
    dueDate: "2026-04-30",
  };

  test("金額一致＋名称一致が最上位に来る", () => {
    const candidates = suggestReconciliations(invoice, [
      { id: 1, date: "2026-04-15", description: "カ）サンプル フリコミ", amount: 78080, appliedAmount: 0 },
      { id: 2, date: "2026-04-15", description: "別件の入金", amount: 78080, appliedAmount: 0 },
      { id: 3, date: "2026-04-15", description: "関係ない少額", amount: 100, appliedAmount: 0 },
    ]);
    expect(candidates.map((c) => c.transactionId)).toEqual([1, 2]);
    expect(candidates[0].reasons).toContain("amount_exact");
    expect(candidates[0].reasons).toContain("name_match");
    expect(candidates[0].suggestedAmount).toBe(78080);
  });

  test("全額消込済みの取引と、金額も名称も合わない取引は候補に出ない", () => {
    const candidates = suggestReconciliations(invoice, [
      { id: 1, date: "2026-04-15", description: "株式会社サンプル", amount: 78080, appliedAmount: 78080 },
      { id: 2, date: "2025-01-05", description: "無関係", amount: 5000, appliedAmount: 0 },
    ]);
    expect(candidates).toEqual([]);
  });

  test("部分入金は残額の一部として提示される", () => {
    const candidates = suggestReconciliations(invoice, [
      { id: 1, date: "2026-04-15", description: "内金", amount: 30000, appliedAmount: 0 },
    ]);
    expect(candidates.length).toBe(1);
    expect(candidates[0].reasons).toContain("amount_partial");
    expect(candidates[0].suggestedAmount).toBe(30000);
  });
});

describe("消込リポジトリ", () => {
  test("全額消込で消込済みになり、請求書応答にも状態が載る", async () => {
    const db = await createTestDb();
    const invoice = await issuedInvoice(db);
    const tx = await incomeTransaction(db, 78080);
    await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: tx,
      amount: 78080,
      feeAmount: 0,
      discountAmount: 0,
      excessAsDeposit: 0,
    });
    const { settlement } = await fetchPaymentsResponse(db, invoice);
    expect(settlement).toMatchObject({
      total_amount: 78080,
      settled_amount: 78080,
      remaining_amount: 0,
      status: "paid",
    });
    const response = await fetchInvoiceResponse(db, invoice);
    expect(response.payment_status).toBe("paid");
    expect(response.remaining_amount).toBe(0);
  });

  test("一部消込は残額が残り、1件の入金を2請求書へ分けられる", async () => {
    const db = await createTestDb();
    const first = await issuedInvoice(db);
    const second = await issuedInvoice(db, { issue_date: "2026-05-01" });
    const tx = await incomeTransaction(db, 100000);
    await insertReconciliation(db, {
      document: first,
      paymentTransaction: tx,
      amount: 78080,
      feeAmount: 0,
      discountAmount: 0,
      excessAsDeposit: 0,
    });
    await insertReconciliation(db, {
      document: second,
      paymentTransaction: tx,
      amount: 21920,
      feeAmount: 0,
      discountAmount: 0,
      excessAsDeposit: 0,
    });
    const applied = await appliedAmountsByTransaction(db, [tx.id]);
    expect(applied.get(tx.id)).toBe(100000);
    const summaries = await settlementSummaries(
      db,
      new Map([
        [first.id, first.totalAmount],
        [second.id, second.totalAmount],
      ]),
    );
    expect(summaries.get(first.id)?.status).toBe("paid");
    expect(summaries.get(second.id)).toMatchObject({
      settledAmount: 21920,
      remainingAmount: 56160,
      status: "partial",
    });
  });

  test("振込手数料の差額調整は支払手数料の取引を生成し消込済みに数える", async () => {
    const db = await createTestDb();
    const invoice = await issuedInvoice(db);
    const tx = await incomeTransaction(db, 77580);
    const created = await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: tx,
      amount: 77580,
      feeAmount: 500,
      discountAmount: 0,
      excessAsDeposit: 0,
    });
    const feeRow = created.find((row) => row.kind === "fee");
    expect(feeRow?.amount).toBe(500);
    const feeTx = await getTransactionRow(db, feeRow!.transactionId);
    expect(feeTx).toMatchObject({ amount: -500, category: "支払手数料" });
    expect(feeTx!.description).toContain("2026-0001");
    const { settlement } = await fetchPaymentsResponse(db, invoice);
    expect(settlement.status).toBe("paid");
    // 解除すると自動生成した手数料取引も論理削除される
    expect(await deleteReconciliation(db, invoice.id, feeRow!.id)).toBe(true);
    expect(await getTransactionRow(db, feeRow!.transactionId)).toBeNull();
    const after = await fetchPaymentsResponse(db, invoice);
    expect(after.settlement).toMatchObject({ settled_amount: 77580, status: "partial" });
  });

  test("売上値引の差額調整は売上値引の取引を生成する", async () => {
    const db = await createTestDb();
    const invoice = await issuedInvoice(db);
    const tx = await incomeTransaction(db, 77080);
    const created = await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: tx,
      amount: 77080,
      feeAmount: 0,
      discountAmount: 1000,
      excessAsDeposit: 0,
    });
    const discountRow = created.find((row) => row.kind === "discount");
    const discountTx = await getTransactionRow(db, discountRow!.transactionId);
    expect(discountTx).toMatchObject({ amount: -1000, category: "売上値引" });
    const { settlement } = await fetchPaymentsResponse(db, invoice);
    expect(settlement.status).toBe("paid");
  });

  test("過入金は預り金の取引を生成して入金を使い切り、消込済み額には数えない", async () => {
    const db = await createTestDb();
    const invoice = await issuedInvoice(db);
    const tx = await incomeTransaction(db, 80000);
    const created = await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: tx,
      amount: 78080,
      feeAmount: 0,
      discountAmount: 0,
      excessAsDeposit: 1920,
    });
    const overRow = created.find((row) => row.kind === "overpayment");
    expect(overRow?.amount).toBe(1920);
    const depositTx = await getTransactionRow(db, overRow!.adjustmentTransactionId!);
    expect(depositTx).toMatchObject({ amount: -1920, category: "預り金" });
    const { settlement } = await fetchPaymentsResponse(db, invoice);
    expect(settlement).toMatchObject({
      settled_amount: 78080,
      overpaid_amount: 1920,
      status: "paid",
    });
    // 入金取引は充当＋預り金で全額使い切った扱いになる
    const applied = await appliedAmountsByTransaction(db, [tx.id]);
    expect(applied.get(tx.id)).toBe(80000);
    // 解除すると預り金取引も消え、入金は再び未消込に戻る
    expect(await deleteReconciliation(db, invoice.id, overRow!.id)).toBe(true);
    expect(await getTransactionRow(db, overRow!.adjustmentTransactionId!)).toBeNull();
    const appliedAfter = await appliedAmountsByTransaction(db, [tx.id]);
    expect(appliedAfter.get(tx.id)).toBe(78080);
  });

  test("消込の解除で入金取引そのものは残る", async () => {
    const db = await createTestDb();
    const invoice = await issuedInvoice(db);
    const tx = await incomeTransaction(db, 78080);
    const created = await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: tx,
      amount: 78080,
      feeAmount: 0,
      discountAmount: 0,
      excessAsDeposit: 0,
    });
    expect(await deleteReconciliation(db, invoice.id, created[0].id)).toBe(true);
    expect(await getTransactionRow(db, tx.id)).not.toBeNull();
    const { settlement, payments } = await fetchPaymentsResponse(db, invoice);
    expect(payments).toEqual([]);
    expect(settlement.status).toBe("unpaid");
    // 存在しない消込の解除は false
    expect(await deleteReconciliation(db, invoice.id, 99999)).toBe(false);
    const all = await listTransactionRows(db);
    expect(all.length).toBe(1);
  });
});
