/**
 * createInvoicePayment.ts — 入金消込の作成ユースケース（usecases）。DB必須。
 *
 * 発行済み請求書へ入金取引を紐付ける。自動推測の候補も、確定は必ず
 * このエンドポイントへの明示的な承認操作で行う（自動では確定しない）。
 * 検証と実行は services/reconciliation（MCP と共用）に集約している。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  CreateInvoicePaymentRequestSchema,
  InvoicePaymentsResponse,
  InvoicePaymentsResponseSchema,
} from "../schemas/reconciliation";
import { applyInvoicePayment } from "../services/reconciliation/reconcileInvoice";

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
  const db = requireDb();
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = CreateInvoicePaymentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "消込の入力が不正です" });
  }
  const { id } = c.req.valid("param");
  const response: InvoicePaymentsResponse = await applyInvoicePayment(db, { invoiceId: id, ...parsed.data });
  return c.json(response, 201);
};
