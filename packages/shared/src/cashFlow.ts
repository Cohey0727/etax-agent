/**
 * cashFlow.ts — 資金繰りレポートの決定的計算（shared、Issue #19）。
 *
 * 過去実績は帳簿の取引（日付ベースの入出金）を月次に集計し、将来分は
 * 発行済みで未消込の請求書の残額を「支払期日どおりに入金される前提」で
 * 積み上げる。freee の資金繰りレポートと同じ決定論方式で、予測の自動
 * 学習のような不確実な要素は入れない。計算はこの純関数だけが行い、
 * API・Web・MCP のどの経路でも同じ入力からは同じ結果になる。
 *
 * 積み上げの規則:
 * - 期日超過（期日の月が当月より前）の未入金は、当月に入金される予定
 *   として扱う（未入金のまま滞留している分を将来残高から落とさない）。
 * - 予定月が表示窓の開始月より前になる場合は開始月に寄せる。
 * - 期日未設定の請求書は月次には積まず、別枠（undatedReceipts）で返す。
 * - 一部消込の請求書は残額だけを積む（消込済み分は入金取引として
 *   実績側に現れるため、二重計上にならない）。
 * - 実績は取引の全額（符号つき金額）で数える。家事按分の事業分だけに
 *   絞ると現金の動きとずれるため、按分は適用しない。資金移動を含む
 *   すべての区分が対象（現金の出入りそのものを見る表のため）。
 */

import type { InvoicePaymentStatus } from "./reconciliation";

/** 実績の入力（帳簿の取引のうち資金繰りに必要な項目だけ）。 */
export interface CashFlowTransactionInput {
  /** YYYY-MM-DD */
  date: string;
  /** 符号つき金額（入金は正、出金は負） */
  amount: number;
}

/** 入金予定の入力（発行済み請求書の未消込残額）。 */
export interface CashFlowReceiptInput {
  documentId: number;
  documentNumber: string | null;
  counterpartyName: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD。未設定は null（月次には積まない） */
  dueDate: string | null;
  /** 請求額（税込） */
  totalAmount: number;
  /** 未消込の残額 */
  remainingAmount: number;
  /** 消込状態（unpaid / partial。paid は残額 0 のため通常含まれない） */
  status: InvoicePaymentStatus;
}

export interface CashFlowOptions {
  /** 表示窓の開始月（YYYY-MM） */
  fromMonth: string;
  /** 表示する月数（1以上） */
  monthCount: number;
  /** 窓の開始月初時点の残高（円） */
  openingBalance: number;
  /** 基準日（YYYY-MM-DD）。当月の判定と期日超過の判定に使う */
  today: string;
}

/** 月の位置づけ（基準日から見た過去・当月・将来）。 */
export const CashFlowMonthPhase = {
  Past: "past",
  Current: "current",
  Future: "future",
} as const;
export type CashFlowMonthPhase = (typeof CashFlowMonthPhase)[keyof typeof CashFlowMonthPhase];

export interface CashFlowMonth {
  /** YYYY-MM */
  month: string;
  phase: CashFlowMonthPhase;
  /** 実績の入金（正の取引の合計） */
  actualInflow: number;
  /** 実績の出金（負の取引の絶対値の合計） */
  actualOutflow: number;
  /** 入金予定（未消込請求書の残額の積み上げ） */
  scheduledInflow: number;
  /** その月の増減（実績の入出金差＋入金予定） */
  netChange: number;
  /** 月末時点の残高（期首残高からの累計） */
  closingBalance: number;
}

/** 期日つきの入金予定（予定月と期日超過フラグを付けたもの）。 */
export interface CashFlowScheduledReceipt extends CashFlowReceiptInput {
  /** 残額を積み上げる月（YYYY-MM） */
  scheduledMonth: string;
  /** 期日が当月より前で未入金のままになっているか */
  overdue: boolean;
}

export interface CashFlowReport {
  fromMonth: string;
  /** 表示窓の最終月（YYYY-MM） */
  toMonth: string;
  openingBalance: number;
  months: CashFlowMonth[];
  /** 期日つきの入金予定（予定月→期日→帳票IDの順） */
  upcomingReceipts: CashFlowScheduledReceipt[];
  /** 期日未設定の入金予定（月次には積んでいない） */
  undatedReceipts: CashFlowReceiptInput[];
  /** 窓内の実績入金の合計 */
  totalActualInflow: number;
  /** 窓内の実績出金の合計 */
  totalActualOutflow: number;
  /** 窓内に積んだ入金予定の合計 */
  totalScheduledInflow: number;
  /** 期日超過の未入金残額の合計（期日未設定分は含まない） */
  overdueAmount: number;
  /** 最終月の月末残高（試算） */
  projectedClosingBalance: number;
}

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

/** YYYY-MM に n か月を加える。 */
export function addMonthsToMonth(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + count;
  const nextYear = year + Math.floor(monthIndex / 12);
  const nextMonth = ((monthIndex % 12) + 12) % 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/** 既定の表示窓: 当月を含む前5か月〜先6か月の12か月。 */
export const CASH_FLOW_DEFAULT_MONTH_COUNT = 12;
export const CASH_FLOW_DEFAULT_PAST_MONTHS = 5;

/** 基準日から既定の計算オプションを作る（期首残高は 0）。 */
export function defaultCashFlowOptions(today: string): CashFlowOptions {
  const currentMonth = today.slice(0, 7);
  return {
    fromMonth: addMonthsToMonth(currentMonth, -CASH_FLOW_DEFAULT_PAST_MONTHS),
    monthCount: CASH_FLOW_DEFAULT_MONTH_COUNT,
    openingBalance: 0,
    today,
  };
}

/**
 * 資金繰りレポートを作る。transactions は全期間分でよく、窓の外の
 * 取引は無視する。receipts は未消込残額があるものだけが意味を持つ
 * （残額 0 以下は予定として数えない）。
 */
export function buildCashFlowReport(
  transactions: readonly CashFlowTransactionInput[],
  receipts: readonly CashFlowReceiptInput[],
  options: CashFlowOptions,
): CashFlowReport {
  if (!monthPattern.test(options.fromMonth)) {
    throw new Error(`fromMonth は YYYY-MM 形式で渡してください: ${options.fromMonth}`);
  }
  if (!datePattern.test(options.today)) {
    throw new Error(`today は YYYY-MM-DD 形式で渡してください: ${options.today}`);
  }
  if (!Number.isInteger(options.monthCount) || options.monthCount < 1) {
    throw new Error(`monthCount は1以上の整数で渡してください: ${options.monthCount}`);
  }
  const { fromMonth, monthCount, openingBalance } = options;
  const toMonth = addMonthsToMonth(fromMonth, monthCount - 1);
  const currentMonth = options.today.slice(0, 7);

  const months: CashFlowMonth[] = [];
  const monthIndexByKey = new Map<string, number>();
  for (let i = 0; i < monthCount; i++) {
    const month = addMonthsToMonth(fromMonth, i);
    monthIndexByKey.set(month, i);
    months.push({
      month,
      phase:
        month < currentMonth
          ? CashFlowMonthPhase.Past
          : month > currentMonth
            ? CashFlowMonthPhase.Future
            : CashFlowMonthPhase.Current,
      actualInflow: 0,
      actualOutflow: 0,
      scheduledInflow: 0,
      netChange: 0,
      closingBalance: 0,
    });
  }

  let totalActualInflow = 0;
  let totalActualOutflow = 0;
  for (const transaction of transactions) {
    const index = monthIndexByKey.get(transaction.date.slice(0, 7));
    if (index === undefined) continue;
    const row = months[index];
    if (!row) continue;
    if (transaction.amount > 0) {
      row.actualInflow += transaction.amount;
      totalActualInflow += transaction.amount;
    } else if (transaction.amount < 0) {
      row.actualOutflow += -transaction.amount;
      totalActualOutflow += -transaction.amount;
    }
  }

  const upcomingReceipts: CashFlowScheduledReceipt[] = [];
  const undatedReceipts: CashFlowReceiptInput[] = [];
  let totalScheduledInflow = 0;
  let overdueAmount = 0;
  for (const receipt of receipts) {
    if (receipt.remainingAmount <= 0) continue;
    if (receipt.dueDate === null) {
      undatedReceipts.push(receipt);
      continue;
    }
    const dueMonth = receipt.dueDate.slice(0, 7);
    const overdue = dueMonth < currentMonth;
    if (overdue) overdueAmount += receipt.remainingAmount;
    const expectedMonth = overdue ? currentMonth : dueMonth;
    const scheduledMonth = expectedMonth < fromMonth ? fromMonth : expectedMonth;
    upcomingReceipts.push({ ...receipt, scheduledMonth, overdue });
    const index = monthIndexByKey.get(scheduledMonth);
    if (index !== undefined) {
      const row = months[index];
      if (row) {
        row.scheduledInflow += receipt.remainingAmount;
        totalScheduledInflow += receipt.remainingAmount;
      }
    }
  }
  upcomingReceipts.sort(
    (a, b) =>
      a.scheduledMonth.localeCompare(b.scheduledMonth) ||
      (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
      a.documentId - b.documentId,
  );
  undatedReceipts.sort(
    (a, b) => a.issueDate.localeCompare(b.issueDate) || a.documentId - b.documentId,
  );

  let balance = openingBalance;
  for (const row of months) {
    row.netChange = row.actualInflow - row.actualOutflow + row.scheduledInflow;
    balance += row.netChange;
    row.closingBalance = balance;
  }

  return {
    fromMonth,
    toMonth,
    openingBalance,
    months,
    upcomingReceipts,
    undatedReceipts,
    totalActualInflow,
    totalActualOutflow,
    totalScheduledInflow,
    overdueAmount,
    projectedClosingBalance: balance,
  };
}
