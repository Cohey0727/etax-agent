/**
 * createTransaction.ts — 取引登録ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 を、バリデーションの
 * 400 より先に返す従来順序を保つため（ルート定義にボディは置かない）。
 * スキーマ自体は schemas/transaction.ts の CreateTransactionRequestSchema。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { insertTransactionRow, transactionToApi } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  CreateTransactionRequestSchema,
  SingleTransactionResponse,
  SingleTransactionResponseSchema,
} from "../schemas/transaction";

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
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
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
  const date = body.date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HTTPException(400, { message: "date は YYYY-MM-DD 形式で指定してください" });
  }
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
    throw new HTTPException(400, { message: "amount は数値で指定してください" });
  }
  let row;
  try {
    row = await insertTransactionRow(db, {
      date,
      description: body.description ?? "",
      amount: Math.trunc(body.amount),
      account: body.account ?? "",
      category: body.category ? body.category : "未分類",
      incomeType: body.income_type ?? "other",
    });
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: SingleTransactionResponse = { transaction: row ? transactionToApi(row) : null };
  return c.json(response, 201);
};
