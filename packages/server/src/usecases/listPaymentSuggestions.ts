/**
 * listPaymentSuggestions.ts — 消込候補の自動推測ユースケース（usecases）。DB必須。
 *
 * 金額一致・取引先名の近似・期日の近接から候補を提示するだけであり、
 * 消込はユーザーが候補を承認して作成エンドポイントを呼ぶまで確定しない。
 * 推測処理は services/reconciliation（MCP と共用）に集約している。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  ReconciliationSuggestionsResponse,
  ReconciliationSuggestionsResponseSchema,
} from "../schemas/reconciliation";
import { suggestInvoicePayments } from "../services/reconciliation/reconcileInvoice";

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
  const db = requireDb();
  const { id } = c.req.valid("param");
  const response: ReconciliationSuggestionsResponse = { candidates: await suggestInvoicePayments(db, id) };
  return c.json(response, 200);
};
