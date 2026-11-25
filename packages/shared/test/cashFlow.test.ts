/**
 * cashFlow.test.ts — 資金繰りレポートの決定的計算（Issue #19）の検証。
 *
 * 実績の月次集計、未消込請求書の残額の積み上げ（期日超過は当月へ、
 * 期日未設定は別枠）、残高の累計が、入力に対して決定的に決まることを
 * 担保する。基準日は 2026-11-25（当月 = 2026-11）で固定する。
 */
import { describe, expect, test } from "bun:test";
import {
  addMonthsToMonth,
  buildCashFlowReport,
  defaultCashFlowOptions,
  type CashFlowReceiptInput,
  type CashFlowTransactionInput,
} from "../src/cashFlow";

const TODAY = "2026-11-25";

function options(overrides: Partial<Parameters<typeof buildCashFlowReport>[2]> = {}) {
  return { fromMonth: "2026-09", monthCount: 5, openingBalance: 0, today: TODAY, ...overrides };
}

function receipt(overrides: Partial<CashFlowReceiptInput> = {}): CashFlowReceiptInput {
  return {
    documentId: 1,
    documentNumber: "2026-0001",
    counterpartyName: "テスト株式会社",
    issueDate: "2026-11-01",
    dueDate: "2026-11-30",
    totalAmount: 110000,
    remainingAmount: 110000,
    status: "unpaid",
    ...overrides,
  };
}

describe("addMonthsToMonth", () => {
  test("年をまたいで加減できる", () => {
    expect(addMonthsToMonth("2026-11", 3)).toBe("2027-02");
    expect(addMonthsToMonth("2026-01", -2)).toBe("2025-11");
    expect(addMonthsToMonth("2026-11", 0)).toBe("2026-11");
  });
});

describe("defaultCashFlowOptions", () => {
  test("当月を含む前5か月〜先6か月の12か月が窓になる", () => {
    const result = defaultCashFlowOptions(TODAY);
    expect(result.fromMonth).toBe("2026-06");
    expect(result.monthCount).toBe(12);
    expect(result.openingBalance).toBe(0);
  });
});

describe("buildCashFlowReport", () => {
  test("空データでは全月ゼロで残高は期首残高のまま", () => {
    const report = buildCashFlowReport([], [], options({ openingBalance: 50000 }));
    expect(report.months).toHaveLength(5);
    expect(report.fromMonth).toBe("2026-09");
    expect(report.toMonth).toBe("2027-01");
    for (const month of report.months) {
      expect(month.actualInflow).toBe(0);
      expect(month.actualOutflow).toBe(0);
      expect(month.scheduledInflow).toBe(0);
      expect(month.closingBalance).toBe(50000);
    }
    expect(report.projectedClosingBalance).toBe(50000);
    expect(report.upcomingReceipts).toHaveLength(0);
    expect(report.undatedReceipts).toHaveLength(0);
  });

  test("実績は日付の月で集計し、窓の外は無視する", () => {
    const transactions: CashFlowTransactionInput[] = [
      { date: "2026-09-10", amount: 300000 },
      { date: "2026-09-20", amount: -120000 },
      { date: "2026-11-05", amount: 50000 },
      { date: "2026-08-31", amount: 999999 }, // 窓の前
      { date: "2027-02-01", amount: 999999 }, // 窓の後
      { date: "2026-10-01", amount: 0 }, // ゼロは入出金どちらにも数えない
    ];
    const report = buildCashFlowReport(transactions, [], options());
    const september = report.months[0];
    const november = report.months[2];
    expect(september?.actualInflow).toBe(300000);
    expect(september?.actualOutflow).toBe(120000);
    expect(september?.netChange).toBe(180000);
    expect(september?.closingBalance).toBe(180000);
    expect(november?.actualInflow).toBe(50000);
    expect(report.totalActualInflow).toBe(350000);
    expect(report.totalActualOutflow).toBe(120000);
    expect(report.projectedClosingBalance).toBe(230000);
  });

  test("月の phase は基準日で past / current / future に分かれる", () => {
    const report = buildCashFlowReport([], [], options());
    expect(report.months.map((m) => m.phase)).toEqual([
      "past",
      "past",
      "current",
      "future",
      "future",
    ]);
  });

  test("未消込の請求書は期日の月に残額が積まれる", () => {
    const report = buildCashFlowReport([], [receipt()], options());
    const november = report.months[2];
    const december = report.months[3];
    expect(november?.scheduledInflow).toBe(110000);
    expect(december?.scheduledInflow).toBe(0);
    expect(report.totalScheduledInflow).toBe(110000);
    expect(report.upcomingReceipts[0]?.scheduledMonth).toBe("2026-11");
    expect(report.upcomingReceipts[0]?.overdue).toBe(false);
  });

  test("一部消込の請求書は残額だけが積まれる", () => {
    const partial = receipt({ status: "partial", remainingAmount: 40000 });
    const report = buildCashFlowReport([], [partial], options());
    expect(report.months[2]?.scheduledInflow).toBe(40000);
  });

  test("消込済み（残額0）の請求書は積まれない", () => {
    const paid = receipt({ status: "paid", remainingAmount: 0 });
    const report = buildCashFlowReport([], [paid], options());
    expect(report.totalScheduledInflow).toBe(0);
    expect(report.upcomingReceipts).toHaveLength(0);
  });

  test("期日超過の未入金は当月に寄せられ overdue になる", () => {
    const overdue = receipt({ issueDate: "2026-09-01", dueDate: "2026-09-30" });
    const report = buildCashFlowReport([], [overdue], options());
    expect(report.upcomingReceipts[0]?.scheduledMonth).toBe("2026-11");
    expect(report.upcomingReceipts[0]?.overdue).toBe(true);
    expect(report.overdueAmount).toBe(110000);
    // 過去月（9月）には積まれず当月（11月）に積まれる
    expect(report.months[0]?.scheduledInflow).toBe(0);
    expect(report.months[2]?.scheduledInflow).toBe(110000);
  });

  test("予定月が窓の開始より前なら開始月に寄せる", () => {
    // 窓は 2026-12 開始。期日超過分は当月（2026-11）扱いだが窓の前なので開始月へ。
    const overdue = receipt({ dueDate: "2026-10-31" });
    const report = buildCashFlowReport([], [overdue], options({ fromMonth: "2026-12" }));
    expect(report.upcomingReceipts[0]?.scheduledMonth).toBe("2026-12");
    expect(report.months[0]?.scheduledInflow).toBe(110000);
  });

  test("期日未設定の請求書は月次に積まず別枠で返す", () => {
    const undated = receipt({ dueDate: null });
    const report = buildCashFlowReport([], [undated], options());
    expect(report.totalScheduledInflow).toBe(0);
    expect(report.upcomingReceipts).toHaveLength(0);
    expect(report.undatedReceipts).toHaveLength(1);
    expect(report.undatedReceipts[0]?.documentId).toBe(1);
    expect(report.overdueAmount).toBe(0);
  });

  test("窓の先の期日は一覧には残るが月次には積まれない", () => {
    const far = receipt({ dueDate: "2027-03-31" });
    const report = buildCashFlowReport([], [far], options());
    expect(report.upcomingReceipts).toHaveLength(1);
    expect(report.upcomingReceipts[0]?.scheduledMonth).toBe("2027-03");
    expect(report.totalScheduledInflow).toBe(0);
  });

  test("残高は期首残高から実績と予定を通して累計される", () => {
    const transactions: CashFlowTransactionInput[] = [
      { date: "2026-11-10", amount: -30000 },
    ];
    const report = buildCashFlowReport(transactions, [receipt()], options({ openingBalance: 100000 }));
    expect(report.months[2]?.closingBalance).toBe(100000 - 30000 + 110000);
    expect(report.projectedClosingBalance).toBe(180000);
  });

  test("不正なオプションは例外にする", () => {
    expect(() => buildCashFlowReport([], [], options({ fromMonth: "2026-13" }))).toThrow(/fromMonth/);
    expect(() => buildCashFlowReport([], [], options({ monthCount: 0 }))).toThrow(/monthCount/);
    expect(() => buildCashFlowReport([], [], options({ today: "2026/11/25" }))).toThrow(/today/);
  });
});
