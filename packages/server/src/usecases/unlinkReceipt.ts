/**
 * unlinkReceipt.ts — 証憑と取引の紐付け解除ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { receiptToApi, unlinkReceiptRow } from "../repositories/receiptRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ReceiptFileIdParamSchema,
  SingleReceiptResponse,
  SingleReceiptResponseSchema,
} from "../schemas/receipt";

export const unlinkReceiptRoute = createRoute({
  method: "delete",
  path: "/api/receipts/{fileId}/link",
  operationId: "unlinkReceipt",
  tags: ["Receipts"],
  summary: "証憑と取引の紐付けを外す（DB必須）",
  request: { params: ReceiptFileIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleReceiptResponseSchema } },
      description: "解除後の証憑",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の証憑が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const unlinkReceiptHandler: RouteHandler<typeof unlinkReceiptRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const fileId = c.req.param("fileId");
  let row;
  try {
    row = await unlinkReceiptRow(db, fileId);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  if (!row) throw new HTTPException(404, { message: "証憑が見つかりません" });
  const response: SingleReceiptResponse = { receipt: receiptToApi(row) };
  return c.json(response, 200);
};
