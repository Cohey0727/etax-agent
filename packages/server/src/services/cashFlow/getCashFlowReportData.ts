/**
 * getCashFlowReportData.ts — 資金繰りレポートの組み立て（services/cashFlow）。
 *
 * REST（GET /api/cash-flow）と MCP（get_cash_flow_report）が同じ結果を
 * 返すよう、DB からの入力収集と shared の決定的計算への橋渡しをここに
 * 一本化する。入力は所有者スコープ付きのリポジトリ経由でのみ集める:
 * - 実績: 帳簿の取引（論理削除済みはリポジトリが除外）
 * - 入金予定: 発行済み請求書のうち未消込残額があるもの（消込サマリは
 *   消込リポジトリの集計を使い、残額の定義を請求書画面と揃える）。
 *   「修正した適格請求書」が発行済みの当初分は、修正分に置き換わるため除く
 * 基準日は Asia/Tokyo の今日（MCP の todayInTokyo と同じ決め方）。
 */
import {
  buildCashFlowReport,
  defaultCashFlowOptions,
  type CashFlowReceiptInput,
  type CashFlowReport,
} from "@etax/shared";
import type { Db } from "../../lib/db";
import { listCorrectedInvoiceIds, listInvoiceRows } from "../../repositories/invoiceRepository";
import { settlementSummaries } from "../../repositories/reconciliationRepository";
import { listTransactionRows } from "../../repositories/transactionRepository";
import type {
  CashFlowReceiptResponse,
  CashFlowReportResponse,
  CashFlowScheduledReceiptResponse,
} from "../../schemas/cashFlow";

export interface CashFlowReportParams {
  /** 表示窓の開始月（YYYY-MM）。省略時は既定窓（当月の5か月前） */
  fromMonth?: string;
  /** 表示する月数。省略時は既定（12） */
  monthCount?: number;
  /** 窓の開始月初時点の残高。省略時は 0 */
  openingBalance?: number;
}

/** Asia/Tokyo の今日（YYYY-MM-DD）。 */
function todayInTokyo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function receiptToApi(receipt: CashFlowReceiptInput): CashFlowReceiptResponse {
  return {
    document_id: receipt.documentId,
    document_number: receipt.documentNumber,
    counterparty_name: receipt.counterpartyName,
    issue_date: receipt.issueDate,
    due_date: receipt.dueDate,
    total_amount: receipt.totalAmount,
    remaining_amount: receipt.remainingAmount,
    status: receipt.status,
  };
}

/** shared の計算結果を API 形式（snake_case）へ変換する。 */
function cashFlowReportToApi(report: CashFlowReport): CashFlowReportResponse {
  return {
    from_month: report.fromMonth,
    to_month: report.toMonth,
    opening_balance: report.openingBalance,
    months: report.months.map((month) => ({
      month: month.month,
      phase: month.phase,
      actual_inflow: month.actualInflow,
      actual_outflow: month.actualOutflow,
      scheduled_inflow: month.scheduledInflow,
      net_change: month.netChange,
      closing_balance: month.closingBalance,
    })),
    upcoming_receipts: report.upcomingReceipts.map(
      (receipt): CashFlowScheduledReceiptResponse => ({
        ...receiptToApi(receipt),
        scheduled_month: receipt.scheduledMonth,
        overdue: receipt.overdue,
      }),
    ),
    undated_receipts: report.undatedReceipts.map(receiptToApi),
    total_actual_inflow: report.totalActualInflow,
    total_actual_outflow: report.totalActualOutflow,
    total_scheduled_inflow: report.totalScheduledInflow,
    overdue_amount: report.overdueAmount,
    projected_closing_balance: report.projectedClosingBalance,
  };
}

/** DB の既存データから資金繰りレポートを組み立てる。 */
export async function fetchCashFlowReport(
  db: Db,
  params: CashFlowReportParams,
): Promise<CashFlowReportResponse> {
  const defaults = defaultCashFlowOptions(todayInTokyo());
  const options = {
    fromMonth: params.fromMonth ?? defaults.fromMonth,
    monthCount: params.monthCount ?? defaults.monthCount,
    openingBalance: params.openingBalance ?? defaults.openingBalance,
    today: defaults.today,
  };

  const transactionRows = await listTransactionRows(db);
  const transactions = transactionRows.map((row) => ({ date: row.date, amount: row.amount }));

  const issuedRows = await listInvoiceRows(db, { status: "issued" });
  const corrected = await listCorrectedInvoiceIds(db, issuedRows.map((row) => row.id));
  const invoiceRows = issuedRows.filter((row) => !corrected.has(row.id));
  const totals = new Map(invoiceRows.map((row) => [row.id, row.totalAmount]));
  const settlements = await settlementSummaries(db, totals);
  const receipts: CashFlowReceiptInput[] = [];
  for (const row of invoiceRows) {
    const settlement = settlements.get(row.id);
    if (!settlement || settlement.remainingAmount <= 0) continue;
    receipts.push({
      documentId: row.id,
      documentNumber: row.documentNumber,
      counterpartyName: row.counterpartyName,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      totalAmount: row.totalAmount,
      remainingAmount: settlement.remainingAmount,
      status: settlement.status,
    });
  }

  return cashFlowReportToApi(buildCashFlowReport(transactions, receipts, options));
}
