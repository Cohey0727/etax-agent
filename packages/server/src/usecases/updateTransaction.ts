/**
 * updateTransaction.ts — 取引更新ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 と id 不正の 400 を
 * 従来順序で返すため（ルート定義にボディは置かない）。
 * 指定されたフィールドだけを更新する（従来どおりの部分更新）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { TransactionRow } from "../repositories/schema";
import { transactionToApi, updateTransactionRow } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  SingleTransactionResponse,
  SingleTransactionResponseSchema,
  TransactionIdParamSchema,
  UpdateTransactionRequestSchema,
} from "../schemas/transaction";

export const updateTransactionRoute = createRoute({
  method: "put",
  path: "/api/transactions/{id}",
  operationId: "updateTransaction",
  tags: ["Transactions"],
  summary: "取引を更新（DB必須）",
  request: { params: TransactionIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleTransactionResponseSchema } },
      description: "更新された取引",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "id またはボディが不正",
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

export const updateTransactionHandler: RouteHandler<typeof updateTransactionRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "id が不正です" });
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateTransactionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const body = parsed.data;
  const patch: Partial<TransactionRow> = {};
  if (body.date !== undefined) {
    // 登録時と同じ日付形式チェック（不正な日付で年度判定が壊れるのを防ぐ）。
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new HTTPException(400, { message: "date は YYYY-MM-DD 形式で指定してください" });
    }
    patch.date = body.date;
  }
  if (
    typeof body.fiscal_year === "number" &&
    Number.isInteger(body.fiscal_year) &&
    body.fiscal_year >= 1900 &&
    body.fiscal_year <= 2100
  ) {
    patch.fiscalYear = body.fiscal_year;
  }
  if (body.description !== undefined) patch.description = body.description;
  if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    patch.amount = Math.trunc(body.amount);
  }
  if (body.account !== undefined) patch.account = body.account;
  if (body.category !== undefined) patch.category = body.category;
  if (body.income_type !== undefined) patch.incomeType = body.income_type;
  if (body.tax_category !== undefined) patch.taxCategory = body.tax_category;
  let row;
  try {
    row = await updateTransactionRow(db, id, patch);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  if (!row) throw new HTTPException(404, { message: "対象の取引が見つかりません" });
  const response: SingleTransactionResponse = { transaction: transactionToApi(row) };
  return c.json(response, 200);
};
