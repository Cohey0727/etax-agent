/**
 * replaceYearTransactions.ts — 1年分の取引の置き換えユースケース（usecases）。DB必須。
 *
 * 画面（取込の確定・領収書の追加など）で確定した1年分の取引リストを、
 * 帳簿（DB）のその年の内容として丸ごと保存する。ボディ検証は
 * createTransaction と同じくハンドラ側で行う（503 を 400 より先に返す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  replaceYearTransactionRows,
  transactionToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListTransactionsResponse,
  ListTransactionsResponseSchema,
  ReplaceYearTransactionsRequestSchema,
} from "../schemas/transaction";

export const replaceYearTransactionsRoute = createRoute({
  method: "post",
  path: "/api/transactions/replace-year",
  operationId: "replaceYearTransactions",
  tags: ["Transactions"],
  summary: "1年分の取引を置き換えて保存（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: ListTransactionsResponseSchema } },
      description: "保存後の取引一覧",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディ・年・日付・金額が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const replaceYearTransactionsHandler: RouteHandler<
  typeof replaceYearTransactionsRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = ReplaceYearTransactionsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "year と transactions が必要です" });
  }
  const { year, transactions } = parsed.data;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
  const values = transactions.map((body) => {
    const date = body.date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${year}-`)) {
      throw new HTTPException(400, {
        message: `date は ${year} 年の YYYY-MM-DD 形式で指定してください`,
      });
    }
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
      throw new HTTPException(400, { message: "amount は数値で指定してください" });
    }
    return {
      date,
      description: body.description ?? "",
      amount: Math.trunc(body.amount),
      account: body.account ?? "",
      category: body.category ? body.category : "未分類",
      incomeType: body.income_type ?? "other",
      taxCategory: body.tax_category ?? "",
    };
  });
  let rows;
  try {
    rows = await replaceYearTransactionRows(db, year, values);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListTransactionsResponse = {
    count: rows.length,
    transactions: rows.map(transactionToApi),
  };
  return c.json(response, 200);
};
