/**
 * createTransaction.ts — 取引登録ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 を、バリデーションの
 * 400 より先に返すため（ルート定義にボディは置かない）。
 * スキーマ自体は schemas/transaction.ts の CreateTransactionRequestSchema。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { transactionToApi } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  CreateTransactionRequestSchema,
  SingleTransactionResponse,
  SingleTransactionResponseSchema,
} from "../schemas/transaction";
import { createTransaction } from "../services/transactions/transactionWrites";

export const createTransactionRoute = createRoute({
  method: "post",
  path: "/api/transactions",
  operationId: "createTransaction",
  tags: ["Transactions"],
  summary: "取引を登録（DB必須）",
  responses: {
    201: {
      content: { "application/json": { schema: SingleTransactionResponseSchema } },
      description: "登録された取引",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディ・日付・金額が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const createTransactionHandler: RouteHandler<typeof createTransactionRoute> = async (c) => {
  const db = requireDb();
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = CreateTransactionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // 厳格に弾くのは amount の型だけ（他フィールドは未指定扱いに寄せる）
    const amountIssue = parsed.error.issues.some((i) => i.path[0] === "amount");
    throw new HTTPException(400, {
      message: amountIssue ? "amount は数値で指定してください" : "JSONボディが必要です",
    });
  }
  const body = parsed.data;
  // 画面は科目の確定時に学習履歴へ別途記録するため、ここでは記録しない。
  const { transaction } = await createTransaction(
    db,
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
    { learn: false, receiptFileIds: body.receipt_file_ids },
  );
  const response: SingleTransactionResponse = { transaction: transactionToApi(transaction) };
  return c.json(response, 201);
};
