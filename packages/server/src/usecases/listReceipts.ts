/**
 * listReceipts.ts — 証憑の一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { listReceiptRows, receiptToApi } from "../repositories/receiptRepository";
import { ErrorSchema } from "../schemas/common";
import { ReceiptListResponse, ReceiptListResponseSchema } from "../schemas/receipt";

export const listReceiptsRoute = createRoute({
  method: "get",
  path: "/api/receipts",
  operationId: "listReceipts",
  tags: ["Receipts"],
  summary: "証憑の一覧（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: ReceiptListResponseSchema } },
      description: "証憑の一覧",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listReceiptsHandler: RouteHandler<typeof listReceiptsRoute> = async (c) => {
  const db = requireDb();
  const rows = await listReceiptRows(db);
  const response: ReceiptListResponse = { receipts: rows.map(receiptToApi) };
  return c.json(response, 200);
};
