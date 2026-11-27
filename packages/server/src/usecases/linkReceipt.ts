/**
 * linkReceipt.ts — 証憑と取引の紐付けユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { linkReceiptRow, receiptToApi } from "../repositories/receiptRepository";
import { getTransactionRow } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  LinkReceiptRequestSchema,
  ReceiptFileIdParamSchema,
  SingleReceiptResponse,
  SingleReceiptResponseSchema,
} from "../schemas/receipt";

export const linkReceiptRoute = createRoute({
  method: "post",
  path: "/api/receipts/{fileId}/link",
  operationId: "linkReceipt",
  tags: ["Receipts"],
  summary: "証憑を取引へ紐付ける（DB必須）",
  request: { params: ReceiptFileIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleReceiptResponseSchema } },
      description: "紐付け後の証憑",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の取引が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const linkReceiptHandler: RouteHandler<typeof linkReceiptRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { fileId } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = LinkReceiptRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "transaction_id が不正です" });
  }
  let row;
  try {
    const transaction = await getTransactionRow(db, parsed.data.transaction_id);
    if (!transaction) {
      throw new HTTPException(404, { message: "対象の取引が見つかりません" });
    }
    row = await linkReceiptRow(db, fileId, parsed.data.transaction_id);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: SingleReceiptResponse = { receipt: row ? receiptToApi(row) : null };
  return c.json(response, 200);
};
