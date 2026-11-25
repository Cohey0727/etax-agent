/**
 * reconciliationRepository.ts — 入金消込テーブルへのデータアクセス（repositories）。
 *
 * 消込の作成は「入金の充当＋差額調整の取引生成＋過入金の預り金生成」を
 * 1トランザクションで行う。差額調整の標準形（freee公式ヘルプの会計処理）:
 * - 振込手数料: 支払手数料の支出取引を自動生成し、その分も消込済みに数える
 * - 売上値引: 売上値引の取引（負額）を自動生成し、その分も消込済みに数える
 * - 過入金: 充当しきれない分を預り金の取引（負額）として自動生成し、
 *   入金取引を使い切る（消込済み額には数えない）
 * 解除時は、自動生成した調整取引も一緒に論理削除し、帳簿に残骸を残さない
 * （入金取引そのものは利用者の記録なので消さない）。
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  computeInvoiceSettlement,
  InvoicePaymentKind,
  InvoiceSettlement,
} from "@etax/shared";
import { Db } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import {
  InvoicePaymentResponse,
  InvoicePaymentsResponse,
  InvoiceSettlementResponse,
} from "../schemas/reconciliation";
import {
  DocumentRow,
  InvoicePaymentRow,
  invoicePaymentsTable,
  TransactionRow,
} from "./schema";
import {
  deleteTransactionRowWith,
  getTransactionRow,
  insertTransactionRowWith,
  transactionToApi,
} from "./transactionRepository";

function paymentOwnerCondition() {
  const owner = currentUserId();
  return owner !== undefined ? eq(invoicePaymentsTable.ownerUserId, owner) : undefined;
}

/** 請求書の消込レコードを作成順に取得する。 */
export async function listInvoicePaymentRows(
  db: Db,
  documentId: number,
): Promise<InvoicePaymentRow[]> {
  const conditions = [eq(invoicePaymentsTable.documentId, documentId)];
  const ownerCondition = paymentOwnerCondition();
  if (ownerCondition) conditions.push(ownerCondition);
  return db
    .select()
    .from(invoicePaymentsTable)
    .where(and(...conditions))
    .orderBy(invoicePaymentsTable.id);
}

/** 消込レコードを API 形式へ変換する（紐付く取引を添える）。 */
export async function paymentToApi(
  db: Db,
  row: InvoicePaymentRow,
): Promise<InvoicePaymentResponse> {
  const transaction = await getTransactionRow(db, row.transactionId);
  return {
    id: row.id,
    document_id: row.documentId,
    transaction_id: row.transactionId,
    adjustment_transaction_id: row.adjustmentTransactionId,
    kind: row.kind as InvoicePaymentKind,
    amount: row.amount,
    transaction: transaction ? transactionToApi(transaction) : null,
    created_at: row.createdAt.toISOString(),
  };
}

/** 請求書の消込一覧＋サマリの API レスポンスを組み立てる。 */
export async function fetchPaymentsResponse(
  db: Db,
  document: DocumentRow,
): Promise<InvoicePaymentsResponse> {
  const rows = await listInvoicePaymentRows(db, document.id);
  const payments = await Promise.all(rows.map((row) => paymentToApi(db, row)));
  const settlement = computeInvoiceSettlement(
    document.totalAmount,
    rows.map((row) => ({ kind: row.kind as InvoicePaymentKind, amount: row.amount })),
  );
  return { payments, settlement: settlementToApi(document.totalAmount, settlement) };
}

export function settlementToApi(
  totalAmount: number,
  settlement: InvoiceSettlement,
): InvoiceSettlementResponse {
  return {
    total_amount: totalAmount,
    settled_amount: settlement.settledAmount,
    remaining_amount: settlement.remainingAmount,
    overpaid_amount: settlement.overpaidAmount,
    status: settlement.status,
  };
}

/**
 * 複数請求書の消込サマリをまとめて計算する（請求書一覧の表示用）。
 * totals は documentId → 税込合計。
 */
export async function settlementSummaries(
  db: Db,
  totals: ReadonlyMap<number, number>,
): Promise<Map<number, InvoiceSettlement>> {
  const result = new Map<number, InvoiceSettlement>();
  const documentIds = [...totals.keys()];
  if (documentIds.length === 0) return result;
  const conditions = [inArray(invoicePaymentsTable.documentId, documentIds)];
  const ownerCondition = paymentOwnerCondition();
  if (ownerCondition) conditions.push(ownerCondition);
  const rows = await db
    .select()
    .from(invoicePaymentsTable)
    .where(and(...conditions));
  const byDocument = new Map<number, InvoicePaymentRow[]>();
  for (const row of rows) {
    const list = byDocument.get(row.documentId) ?? [];
    list.push(row);
    byDocument.set(row.documentId, list);
  }
  for (const [documentId, total] of totals) {
    const entries = (byDocument.get(documentId) ?? []).map((row) => ({
      kind: row.kind as InvoicePaymentKind,
      amount: row.amount,
    }));
    result.set(documentId, computeInvoiceSettlement(total, entries));
  }
  return result;
}

/** 取引ごとに、すでに消し込まれた額（充当＋過入金で使い切った分）を集計する。 */
export async function appliedAmountsByTransaction(
  db: Db,
  transactionIds: readonly number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (transactionIds.length === 0) return result;
  const conditions = [inArray(invoicePaymentsTable.transactionId, [...transactionIds])];
  const ownerCondition = paymentOwnerCondition();
  if (ownerCondition) conditions.push(ownerCondition);
  const rows = await db
    .select()
    .from(invoicePaymentsTable)
    .where(and(...conditions));
  for (const row of rows) {
    // 入金取引を使い切るのは payment（充当）と overpayment（預り金化）の2種。
    // fee / discount の transaction_id は自動生成取引で、入金取引とは別物。
    if (row.kind !== InvoicePaymentKind.Payment && row.kind !== InvoicePaymentKind.Overpayment) {
      continue;
    }
    result.set(row.transactionId, (result.get(row.transactionId) ?? 0) + row.amount);
  }
  return result;
}

export interface ReconciliationInput {
  document: DocumentRow;
  paymentTransaction: TransactionRow;
  /** 入金取引から充当する額。 */
  amount: number;
  /** 振込手数料として差額調整する額（0なら調整しない）。 */
  feeAmount: number;
  /** 売上値引として差額調整する額（0なら調整しない）。 */
  discountAmount: number;
  /** 過入金として預り金処理する額（0なら処理しない）。 */
  excessAsDeposit: number;
}

/** 差額調整の自動生成取引の共通項目（入金取引の日付・口座・区分を引き継ぐ）。 */
function adjustmentValues(
  input: ReconciliationInput,
  amount: number,
  category: string,
  description: string,
) {
  const source = input.paymentTransaction;
  return {
    date: source.date,
    fiscalYear: source.fiscalYear || Number(source.date.slice(0, 4)) || 0,
    description,
    amount,
    account: source.account,
    category,
    incomeType: source.incomeType,
    taxCategory: "",
    businessRatioPercent: 100,
    businessRatioBasis: "",
  };
}

/**
 * 消込を1件作成する。充当・差額調整・預り金の生成を1トランザクションで
 * 行い、作成した消込レコードを返す。金額の妥当性（残額・未消込額の範囲）は
 * 呼び出し側（usecases）が検証済みである前提。
 */
export async function insertReconciliation(
  db: Db,
  input: ReconciliationInput,
): Promise<InvoicePaymentRow[]> {
  const label = input.document.documentNumber ?? `#${input.document.id}`;
  return db.transaction(async (tx) => {
    const created: InvoicePaymentRow[] = [];
    const insertRow = async (
      values: Omit<InvoicePaymentRow, "id" | "createdAt" | "ownerUserId">,
    ) => {
      const [row] = await tx
        .insert(invoicePaymentsTable)
        .values({ ...values, ownerUserId: ownerIdForWrite() })
        .returning();
      if (row) created.push(row);
    };
    await insertRow({
      documentId: input.document.id,
      transactionId: input.paymentTransaction.id,
      adjustmentTransactionId: null,
      kind: InvoicePaymentKind.Payment,
      amount: input.amount,
    });
    if (input.feeAmount > 0) {
      const feeTx = await insertTransactionRowWith(
        tx,
        adjustmentValues(
          input,
          -input.feeAmount,
          "支払手数料",
          `振込手数料（請求書 ${label} の差額調整）`,
        ),
      );
      if (feeTx) {
        await insertRow({
          documentId: input.document.id,
          transactionId: feeTx.id,
          adjustmentTransactionId: null,
          kind: InvoicePaymentKind.Fee,
          amount: input.feeAmount,
        });
      }
    }
    if (input.discountAmount > 0) {
      const discountTx = await insertTransactionRowWith(
        tx,
        adjustmentValues(input, -input.discountAmount, "売上値引", `売上値引（請求書 ${label}）`),
      );
      if (discountTx) {
        await insertRow({
          documentId: input.document.id,
          transactionId: discountTx.id,
          adjustmentTransactionId: null,
          kind: InvoicePaymentKind.Discount,
          amount: input.discountAmount,
        });
      }
    }
    if (input.excessAsDeposit > 0) {
      const depositTx = await insertTransactionRowWith(
        tx,
        adjustmentValues(
          input,
          -input.excessAsDeposit,
          "預り金",
          `過入金の預り金（請求書 ${label}）`,
        ),
      );
      await insertRow({
        documentId: input.document.id,
        transactionId: input.paymentTransaction.id,
        adjustmentTransactionId: depositTx?.id ?? null,
        kind: InvoicePaymentKind.Overpayment,
        amount: input.excessAsDeposit,
      });
    }
    return created;
  });
}

/**
 * 消込を解除する。自動生成した差額調整・預り金の取引は一緒に論理削除する。
 * 対象が無ければ false。
 */
export async function deleteReconciliation(
  db: Db,
  documentId: number,
  paymentId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const conditions = [
      eq(invoicePaymentsTable.id, paymentId),
      eq(invoicePaymentsTable.documentId, documentId),
    ];
    const ownerCondition = paymentOwnerCondition();
    if (ownerCondition) conditions.push(ownerCondition);
    const [row] = await tx
      .select()
      .from(invoicePaymentsTable)
      .where(and(...conditions));
    if (!row) return false;
    await tx.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.id, paymentId));
    if (
      (row.kind === InvoicePaymentKind.Fee || row.kind === InvoicePaymentKind.Discount) &&
      row.transactionId
    ) {
      await deleteTransactionRowWith(tx, row.transactionId);
    }
    if (row.adjustmentTransactionId) {
      await deleteTransactionRowWith(tx, row.adjustmentTransactionId);
    }
    return true;
  });
}
