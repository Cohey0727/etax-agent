/**
 * updateTransaction.ts — 取引更新ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 をボディ不正の 400 より
 * 先に返すため（ルート定義にボディは置かない）。
 * 指定されたフィールドだけを更新する（部分更新）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { transactionToApi } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  SingleTransactionResponse,
  SingleTransactionResponseSchema,
  TransactionIdParamSchema,
  UpdateTransactionRequestSchema,
} from "../schemas/transaction";
import { updateTransaction } from "../services/transactions/transactionWrites";

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
  const db = requireDb();
  const { id } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateTransactionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // 厳格に弾くのは amount の型だけ（他フィールドは未指定扱いに寄せる）
    const amountIssue = parsed.error.issues.some((i) => i.path[0] === "amount");
    throw new HTTPException(400, {
      message: amountIssue ? "amount は数値で指定してください" : "JSONボディが必要です",
    });
  }
  const body = parsed.data;
  // 画面は科目を直したときに学習履歴へ別途記録するため、ここでは記録しない。
  const result = await updateTransaction(
    db,
    id,
    {
      date: body.date,
      fiscalYear: body.fiscal_year,
      description: body.description,
      amount: body.amount,
      account: body.account,
      category: body.category,
      incomeType: body.income_type,
      taxCategory: body.tax_category,
      businessRatioPercent: body.business_ratio_percent,
      businessRatioBasis: body.business_ratio_basis,
    },
    { learn: false },
  );
  if (!result) throw new HTTPException(404, { message: "対象の取引が見つかりません" });
  const response: SingleTransactionResponse = { transaction: transactionToApi(result.transaction) };
  return c.json(response, 200);
};
