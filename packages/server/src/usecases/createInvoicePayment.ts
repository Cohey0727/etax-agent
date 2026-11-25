/**
 * createInvoicePayment.ts — 入金消込の作成ユースケース（usecases）。DB必須。
 *
 * 発行済み請求書へ入金取引を紐付ける。自動推測の候補も、確定は必ず
 * このエンドポイントへの明示的な承認操作で行う（自動では確定しない）。
 * 差額がある場合は、振込手数料（支払手数料）・売上値引として調整でき、
 * 過入金は預り金として処理して入金取引を使い切ることもできる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { getInvoiceRow } from "../repositories/invoiceRepository";
import {
  appliedAmountsByTransaction,
  fetchPaymentsResponse,
  insertReconciliation,
  settlementSummaries,
} from "../repositories/reconciliationRepository";
import { getTransactionRow } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  CreateInvoicePaymentRequestSchema,
  InvoicePaymentsResponse,
  InvoicePaymentsResponseSchema,
} from "../schemas/reconciliation";

export const createInvoicePaymentRoute = createRoute({
  method: "post",
  path: "/api/invoices/{id}/payments",
  operationId: "createInvoicePayment",
  tags: ["Invoices"],
  summary: "請求書へ入金を消し込む（差額調整つき）（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: InvoicePaymentsResponseSchema } },
      description: "消込後の一覧とサマリ",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "未発行、金額の範囲超過、入金取引でない等",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "請求書が存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const createInvoicePaymentHandler: RouteHandler<typeof createInvoicePaymentRoute> = async (
  c,
) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = CreateInvoicePaymentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "消込の入力が不正です" });
  }
  const body = parsed.data;
  const id = Number(c.req.valid("param").id);
  let response: InvoicePaymentsResponse;
  try {
    const invoice = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!invoice) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (invoice.status !== "issued") {
      throw new HTTPException(400, { message: "発行済みの請求書にだけ消込できます" });
    }
    const transaction = await getTransactionRow(db, body.transaction_id);
    if (!transaction || transaction.amount <= 0) {
      throw new HTTPException(400, { message: "入金取引（プラスの取引）を指定してください" });
    }
    const summaries = await settlementSummaries(
      db,
      new Map([[invoice.id, invoice.totalAmount]]),
    );
    const settlement = summaries.get(invoice.id);
    if (!settlement || settlement.remainingAmount <= 0) {
      throw new HTTPException(400, { message: "この請求書はすでに消込済みです" });
    }
    const applied = await appliedAmountsByTransaction(db, [transaction.id]);
    const unapplied = transaction.amount - (applied.get(transaction.id) ?? 0);
    if (unapplied <= 0) {
      throw new HTTPException(400, { message: "この入金取引はすでに全額消込済みです" });
    }
    const feeAmount = body.fee_amount ?? 0;
    const discountAmount = body.discount_amount ?? 0;
    const amount = body.amount ?? Math.min(unapplied, settlement.remainingAmount);
    if (amount > unapplied) {
      throw new HTTPException(400, { message: "充当額が入金取引の未消込額を超えています" });
    }
    if (amount + feeAmount + discountAmount > settlement.remainingAmount) {
      throw new HTTPException(400, {
        message: "充当額と差額調整の合計が請求残額を超えています",
      });
    }
    const excessAsDeposit = body.treat_excess_as_deposit ? unapplied - amount : 0;
    await insertReconciliation(db, {
      document: invoice,
      paymentTransaction: transaction,
      amount,
      feeAmount,
      discountAmount,
      excessAsDeposit,
    });
    response = await fetchPaymentsResponse(db, invoice);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 201);
};
