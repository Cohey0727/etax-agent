/**
 * listPaymentSuggestions.ts — 消込候補の自動推測ユースケース（usecases）。DB必須。
 *
 * 金額一致・取引先名の近似・期日の近接から候補を提示するだけであり、
 * 消込はユーザーが候補を承認して作成エンドポイントを呼ぶまで確定しない。
 */
import { suggestReconciliations } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { getInvoiceRow } from "../repositories/invoiceRepository";
import {
  appliedAmountsByTransaction,
  settlementSummaries,
} from "../repositories/reconciliationRepository";
import {
  listTransactionRows,
  transactionToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  ReconciliationSuggestionsResponse,
  ReconciliationSuggestionsResponseSchema,
} from "../schemas/reconciliation";

export const listPaymentSuggestionsRoute = createRoute({
  method: "get",
  path: "/api/invoices/{id}/payment-suggestions",
  operationId: "listPaymentSuggestions",
  tags: ["Invoices"],
  summary: "請求書への消込候補を自動推測（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ReconciliationSuggestionsResponseSchema } },
      description: "消込候補の一覧",
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

export const listPaymentSuggestionsHandler: RouteHandler<
  typeof listPaymentSuggestionsRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  let response: ReconciliationSuggestionsResponse;
  try {
    const invoice = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!invoice) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (invoice.status !== "issued") {
      response = { candidates: [] };
      return c.json(response, 200);
    }
    const summaries = await settlementSummaries(
      db,
      new Map([[invoice.id, invoice.totalAmount]]),
    );
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
    response = {
      candidates: candidates.flatMap((candidate) => {
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
      }),
    };
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
