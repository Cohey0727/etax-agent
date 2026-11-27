/**
 * reconciliationService.test.ts — 消込サービス（検証・所有者分離・削除追随）の検証。
 *
 * REST と MCP が共用する services/reconciliation の検証ルール（二重消込の
 * 防止、金額の範囲、未発行・削除済み取引の拒否）と、所有者分離、帳簿側で
 * 取引が論理削除された場合に消込が集計から外れることを担保する。
 * テスト用 PostgreSQL が必要。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  insertInvoice,
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import { DocumentRow, TransactionRow } from "../src/repositories/schema";
import { fetchPaymentsResponse } from "../src/repositories/reconciliationRepository";
import {
  insertTransactionRow,
  listTransactionRows,
  updateTransactionRow,
} from "../src/repositories/transactionRepository";
import { createUser } from "../src/repositories/userRepository";
import {
  applyInvoicePayment,
  ReconciliationError,
  releaseInvoicePayment,
  suggestInvoicePayments,
} from "../src/services/reconciliation/reconcileInvoice";
import { Db } from "../src/lib/db";
import { fetchCashFlowReport } from "../src/services/cashFlow/getCashFlowReportData";
import {
  createInvoiceCorrectionDraft,
  createInvoiceDocument,
  issueInvoiceDocument,
} from "../src/services/invoice/invoiceDocuments";

async function makeInvoice(db: Db, totalAmount: number, issue = true): Promise<DocumentRow> {
  const header: InvoiceHeaderDraft = {
    issue_date: "2026-03-01",
    due_date: "2026-03-31",
    counterparty_name: "株式会社テスト商事",
    counterparty_address: "東京都港区芝公園4-2-8",
    is_qualified: true,
    tax_rounding: "floor",
    memo: "",
  };
  const unitPrice = Math.round(totalAmount / 1.1);
  const lines: InvoiceLineDraft[] = [
    {
      item_name: "Webサイト制作費",
      quantity: 1,
      unit: "式",
      unit_price: unitPrice,
      tax_rate_percent: 10,
      is_reduced_rate: false,
    },
  ];
  const created = await insertInvoice(db, header, lines, null);
  if (!created) throw new Error("請求書の作成に失敗");
  if (!issue) return created;
  const issued = await markInvoiceIssued(db, created.id, "2026-0001", {
    name: "山田太郎",
    zip_code: "100-0001",
    address: "東京都千代田区千代田1-1",
    invoice_number: "T1234567890123",
  });
  if (!issued) throw new Error("発行に失敗");
  return issued;
}

async function makeTx(db: Db, amount: number, description = "入金"): Promise<TransactionRow> {
  const row = await insertTransactionRow(db, {
    date: "2026-03-15",
    fiscalYear: 2026,
    description,
    amount,
    account: "普通預金",
    category: amount > 0 ? "売上高" : "支払手数料",
    incomeType: "business",
    taxCategory: "",
    businessRatioPercent: 100,
    businessRatioBasis: "",
  });
  if (!row) throw new Error("取引の登録に失敗");
  return row;
}

/** ReconciliationError の status を取り出す（投げられなければ null）。 */
async function errorStatus(fn: () => Promise<unknown>): Promise<number | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof ReconciliationError) return e.status;
    throw e;
  }
}

describe("消込サービスの検証ルール", () => {
  test("未発行・支出取引・削除済み取引・存在しない請求書を拒否する", async () => {
    const db = await createTestDb();
    const draft = await makeInvoice(db, 110000, false);
    const issued = await makeInvoice(db, 110000);
    const income = await makeTx(db, 110000);
    const expense = await makeTx(db, -440);
    const deleted = await makeTx(db, 50000);
    await updateTransactionRow(db, deleted.id, { deletedAt: new Date() });

    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: draft.id, transaction_id: income.id }),
      ),
    ).toBe(400);
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: issued.id, transaction_id: expense.id }),
      ),
    ).toBe(400);
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: issued.id, transaction_id: deleted.id }),
      ),
    ).toBe(400);
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: 99999999, transaction_id: income.id }),
      ),
    ).toBe(404);
  });

  test("金額の範囲超過と二重消込を拒否する", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 110000);
    const income = await makeTx(db, 110000);
    // 充当額が請求残額を超える
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: invoice.id, transaction_id: income.id, amount: 120000 }),
      ),
    ).toBe(400);
    // 充当＋手数料が請求残額を超える
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, {
          invoiceId: invoice.id,
          transaction_id: income.id,
          amount: 109000,
          fee_amount: 2000,
        }),
      ),
    ).toBe(400);
    // 全額消込した後は、二重消込も入金の再利用もできない
    await applyInvoicePayment(db, { invoiceId: invoice.id, transaction_id: income.id });
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: invoice.id, transaction_id: income.id }),
      ),
    ).toBe(400);
    const other = await makeInvoice(db, 55000);
    expect(
      await errorStatus(() =>
        applyInvoicePayment(db, { invoiceId: other.id, transaction_id: income.id }),
      ),
    ).toBe(400);
    // 存在しない消込の解除は 404
    expect(await errorStatus(() => releaseInvoicePayment(db, other.id, 99999999))).toBe(404);
  });

  test("入金取引が論理削除されると消込は集計から外れ、解除で掃除できる", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 110000);
    const income = await makeTx(db, 50000);
    const applied = await applyInvoicePayment(db, {
      invoiceId: invoice.id,
      transaction_id: income.id,
    });
    expect(applied.settlement.status).toBe("partial");
    const paymentId = applied.payments[0]?.id ?? 0;

    await updateTransactionRow(db, income.id, { deletedAt: new Date() });
    const afterDelete = await fetchPaymentsResponse(db, invoice);
    expect(afterDelete.settlement.status).toBe("unpaid");
    expect(afterDelete.settlement.settled_amount).toBe(0);
    expect(afterDelete.payments).toHaveLength(0);

    // レコード自体は残っているため、解除で掃除できる
    const released = await releaseInvoicePayment(db, invoice.id, paymentId);
    expect(released.settlement.status).toBe("unpaid");
  });

  test("差額調整の取引が論理削除されると調整分が集計から外れる", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 110000);
    const income = await makeTx(db, 109560, "振込 株式会社テスト商事");
    const applied = await applyInvoicePayment(db, {
      invoiceId: invoice.id,
      transaction_id: income.id,
      fee_amount: 440,
    });
    expect(applied.settlement.status).toBe("paid");
    const feeRow = applied.payments.find((p) => p.kind === "fee");
    expect(feeRow).toBeDefined();

    // fee 行の transaction_id が自動生成した支払手数料の取引そのもの
    await updateTransactionRow(db, feeRow?.transaction_id ?? 0, {
      deletedAt: new Date(),
    });
    const after = await fetchPaymentsResponse(db, invoice);
    expect(after.settlement.status).toBe("partial");
    expect(after.settlement.settled_amount).toBe(109560);
  });
});

describe("消込の所有者分離", () => {
  test("他ユーザーの請求書・取引は消込できず、候補にも出ない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "recon-a@example.com", "password-123");
    const userB = await createUser(db, "recon-b@example.com", "password-456");

    const { invoiceA, incomeA } = await runWithTenant(userA.id, async () => ({
      invoiceA: await makeInvoice(db, 110000),
      incomeA: await makeTx(db, 110000, "振込 株式会社テスト商事"),
    }));

    // B からは A の請求書が見えない（404）
    expect(
      await runWithTenant(userB.id, () =>
        errorStatus(() =>
          applyInvoicePayment(db, { invoiceId: invoiceA.id, transaction_id: incomeA.id }),
        ),
      ),
    ).toBe(404);
    expect(
      await runWithTenant(userB.id, () => errorStatus(() => suggestInvoicePayments(db, invoiceA.id))),
    ).toBe(404);

    // B の請求書に A の取引は紐付けできない（取引が見えないため 400）
    const invoiceB = await runWithTenant(userB.id, () => makeInvoice(db, 110000));
    expect(
      await runWithTenant(userB.id, () =>
        errorStatus(() =>
          applyInvoicePayment(db, { invoiceId: invoiceB.id, transaction_id: incomeA.id }),
        ),
      ),
    ).toBe(400);

    // A の文脈では通常どおり消込でき、候補にも A の取引だけが出る
    const candidates = await runWithTenant(userA.id, () => suggestInvoicePayments(db, invoiceA.id));
    expect(candidates.map((c) => c.transaction.id)).toEqual([incomeA.id]);
    const applied = await runWithTenant(userA.id, () =>
      applyInvoicePayment(db, { invoiceId: invoiceA.id, transaction_id: incomeA.id }),
    );
    expect(applied.settlement.status).toBe("paid");
  });
});

/** 帳簿（削除済みを除く）の金額の合計と、収入（正の額）の合計。 */
async function ledgerSums(db: Db): Promise<{ net: number; revenue: number; rows: number }> {
  const rows = await listTransactionRows(db);
  return {
    net: rows.reduce((sum, row) => sum + row.amount, 0),
    revenue: rows.reduce((sum, row) => (row.amount > 0 ? sum + row.amount : sum), 0),
    rows: rows.length,
  };
}

describe("差額調整の取引は帳簿の合計を入金額に保つ", () => {
  test("振込手数料: 売上高の計上分と支払手数料を対で作り、解除で対ごと消す", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 110000);
    const income = await makeTx(db, 109560, "振込 株式会社テスト商事");
    const applied = await applyInvoicePayment(db, {
      invoiceId: invoice.id,
      transaction_id: income.id,
      amount: 109560,
      fee_amount: 440,
    });
    expect(applied.settlement.status).toBe("paid");
    const sums = await ledgerSums(db);
    // 帳簿の合計は入金額のまま、収入は請求額、手数料は経費に載る
    expect(sums.net).toBe(109560);
    expect(sums.revenue).toBe(110000);
    const rows = await listTransactionRows(db);
    expect(rows.map((row) => [row.category, row.amount]).sort()).toEqual(
      [
        ["売上高", 109560],
        ["売上高", 440],
        ["支払手数料", -440],
      ].sort(),
    );

    const feeRow = applied.payments.find((p) => p.kind === "fee");
    await releaseInvoicePayment(db, invoice.id, feeRow?.id ?? 0);
    const afterRelease = await ledgerSums(db);
    expect(afterRelease).toEqual({ net: 109560, revenue: 109560, rows: 1 });
  });

  test("売上値引: 売上高の計上分と売上値引を対で作り、帳簿の合計は入金額のまま", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 110000);
    const income = await makeTx(db, 100000, "振込 株式会社テスト商事");
    const applied = await applyInvoicePayment(db, {
      invoiceId: invoice.id,
      transaction_id: income.id,
      amount: 100000,
      discount_amount: 10000,
    });
    expect(applied.settlement.status).toBe("paid");
    const sums = await ledgerSums(db);
    expect(sums.net).toBe(100000);
    expect(sums.revenue).toBe(110000);
  });
});

describe("消込の同時実行", () => {
  test("同じ入金を同じ請求書へ同時に充当しても、請求残額を超えて消し込まない", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 11000);
    const income = await makeTx(db, 22000, "振込 株式会社テスト商事");
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        applyInvoicePayment(db, { invoiceId: invoice.id, transaction_id: income.id, amount: 11000 }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ReconciliationError);
    }
    const after = await fetchPaymentsResponse(db, invoice);
    expect(after.payments).toHaveLength(1);
    expect(after.settlement.settled_amount).toBe(11000);
  });

  test("手数料つきの同時充当でも、支払手数料の取引は1件だけ作る", async () => {
    const db = await createTestDb();
    const invoice = await makeInvoice(db, 11000);
    const income = await makeTx(db, 10670, "振込 株式会社テスト商事");
    await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        applyInvoicePayment(db, {
          invoiceId: invoice.id,
          transaction_id: income.id,
          amount: 10670,
          fee_amount: 330,
        }),
      ),
    );
    const rows = await listTransactionRows(db);
    expect(rows.filter((row) => row.category === "支払手数料")).toHaveLength(1);
  });
});

describe("修正した適格請求書の当初分", () => {
  test("修正分を発行すると、当初分は入金予定と消込候補から外れる", async () => {
    const db = await createTestDb();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const created = await createInvoiceDocument(db, {
      issue_date: today,
      due_date: today,
      counterparty_name: "株式会社テスト商事",
      is_qualified: false,
      lines: [{ item_name: "開発", quantity: 1, unit_price: 100000, tax_rate_percent: 10 }],
    });
    const original = await issueInvoiceDocument(db, created!.id);
    await makeTx(db, 110000, "振込 株式会社テスト商事");
    expect(await suggestInvoicePayments(db, original.id)).toHaveLength(1);

    // 修正用の下書きだけでは当初分はそのまま
    const draft = await createInvoiceCorrectionDraft(db, original.id);
    expect((await fetchCashFlowReport(db, {})).total_scheduled_inflow).toBe(110000);

    const corrected = await issueInvoiceDocument(db, draft!.id);
    const report = await fetchCashFlowReport(db, {});
    expect(report.total_scheduled_inflow).toBe(110000);
    expect(report.upcoming_receipts.map((r) => r.document_id)).toEqual([corrected.id]);
    expect(await suggestInvoicePayments(db, original.id)).toEqual([]);
    expect(await suggestInvoicePayments(db, corrected.id)).toHaveLength(1);
  });
});
