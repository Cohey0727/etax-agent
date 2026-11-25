/**
 * reconcileInvoice.ts — 入金消込の検証と実行（services/reconciliation）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う共通処理。
 * 金額の範囲検証（請求残額・入金の未消込額・差額調整の合計）をここに集約し、
 * 呼び出し経路で結果がずれないようにする。自動推測は候補の提示までで、
 * 消込の確定は applyInvoicePayment の明示的な呼び出しでのみ行う。
 */
import { suggestReconciliations } from "@etax/shared";
import { Db } from "../../lib/db";
import { getInvoiceRow } from "../../repositories/invoiceRepository";
import {
  appliedAmountsByTransaction,
  deleteReconciliation,
  fetchPaymentsResponse,
  insertReconciliation,
  settlementSummaries,
} from "../../repositories/reconciliationRepository";
import {
  getTransactionRow,
  listTransactionRows,
  transactionToApi,
} from "../../repositories/transactionRepository";
import {
  CreateInvoicePaymentRequest,
  InvoicePaymentsResponse,
  ReconciliationCandidateResponse,
} from "../../schemas/reconciliation";

/** 消込の業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class ReconciliationError extends Error {
  readonly status: 400 | 404;

  constructor(status: 400 | 404, message: string) {
    super(message);
    this.name = "ReconciliationError";
    this.status = status;
  }
}

export interface ApplyInvoicePaymentInput extends CreateInvoicePaymentRequest {
  invoiceId: number;
}

/**
 * 消込を作成する。発行済み請求書・入金取引（プラスの有効な取引）であること、
 * 充当額が入金の未消込額と請求残額の範囲内であることを検証してから、
 * 充当・差額調整・預り金を1トランザクションで記録する。
 */
export async function applyInvoicePayment(
  db: Db,
  input: ApplyInvoicePaymentInput,
): Promise<InvoicePaymentsResponse> {
  const invoice = await getInvoiceRow(db, input.invoiceId);
  if (!invoice) throw new ReconciliationError(404, "請求書が見つかりません");
  if (invoice.status !== "issued") {
    throw new ReconciliationError(400, "発行済みの請求書にだけ消込できます");
  }
  const transaction = await getTransactionRow(db, input.transaction_id);
  if (!transaction || transaction.amount <= 0) {
    throw new ReconciliationError(400, "入金取引（プラスの取引）を指定してください");
  }
  const summaries = await settlementSummaries(db, new Map([[invoice.id, invoice.totalAmount]]));
  const settlement = summaries.get(invoice.id);
  if (!settlement || settlement.remainingAmount <= 0) {
    throw new ReconciliationError(400, "この請求書はすでに消込済みです");
  }
  const applied = await appliedAmountsByTransaction(db, [transaction.id]);
  const unapplied = transaction.amount - (applied.get(transaction.id) ?? 0);
  if (unapplied <= 0) {
    throw new ReconciliationError(400, "この入金取引はすでに全額消込済みです");
  }
  const feeAmount = input.fee_amount ?? 0;
  const discountAmount = input.discount_amount ?? 0;
  const amount = input.amount ?? Math.min(unapplied, settlement.remainingAmount);
  if (amount > unapplied) {
    throw new ReconciliationError(400, "充当額が入金取引の未消込額を超えています");
  }
  if (amount + feeAmount + discountAmount > settlement.remainingAmount) {
    throw new ReconciliationError(400, "充当額と差額調整の合計が請求残額を超えています");
  }
  const excessAsDeposit = input.treat_excess_as_deposit ? unapplied - amount : 0;
  await insertReconciliation(db, {
    document: invoice,
    paymentTransaction: transaction,
    amount,
    feeAmount,
    discountAmount,
    excessAsDeposit,
  });
  return fetchPaymentsResponse(db, invoice);
}

/**
 * 消込を解除する。自動生成した差額調整・預り金の取引も一緒に論理削除される
 * （リポジトリ側）。入金取引そのものは残る。
 */
export async function releaseInvoicePayment(
  db: Db,
  invoiceId: number,
  paymentId: number,
): Promise<InvoicePaymentsResponse> {
  const invoice = await getInvoiceRow(db, invoiceId);
  if (!invoice) throw new ReconciliationError(404, "請求書が見つかりません");
  const deleted = await deleteReconciliation(db, invoiceId, paymentId);
  if (!deleted) throw new ReconciliationError(404, "消込が見つかりません");
  return fetchPaymentsResponse(db, invoice);
}

/**
 * 消込候補を自動推測する。金額一致・取引先名の近似・期日の近接で採点した
 * 候補を返すだけで、消込は確定しない（確定は applyInvoicePayment のみ）。
 */
export async function suggestInvoicePayments(
  db: Db,
  invoiceId: number,
): Promise<ReconciliationCandidateResponse[]> {
  const invoice = await getInvoiceRow(db, invoiceId);
  if (!invoice) throw new ReconciliationError(404, "請求書が見つかりません");
  if (invoice.status !== "issued") return [];
  const summaries = await settlementSummaries(db, new Map([[invoice.id, invoice.totalAmount]]));
  const remaining = summaries.get(invoice.id)?.remainingAmount ?? invoice.totalAmount;
  const incomeRows = (await listTransactionRows(db)).filter((row) => row.amount > 0);
  const applied = await appliedAmountsByTransaction(
    db,
    incomeRows.map((row) => row.id),
  );
  const candidates = suggestReconciliations(
    {
      totalAmount: invoice.totalAmount,
      remainingAmount: remaining,
      counterpartyName: invoice.counterpartyName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
    },
    incomeRows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      appliedAmount: applied.get(row.id) ?? 0,
    })),
  );
  const byId = new Map(incomeRows.map((row) => [row.id, row]));
  return candidates.flatMap((candidate) => {
    const row = byId.get(candidate.transactionId);
    return row
      ? [
          {
            transaction: transactionToApi(row),
            unapplied_amount: candidate.unappliedAmount,
            suggested_amount: candidate.suggestedAmount,
            score: candidate.score,
            reasons: candidate.reasons,
          },
        ]
      : [];
  });
}
