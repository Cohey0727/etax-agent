/**
 * replaceYearTransactions.ts — 1年分の取引の置き換えユースケース（usecases）。DB必須。
 *
 * 画面（取込の確定・領収書の追加など）で確定した1年分の取引リストを、
 * 帳簿（DB）のその年の内容として丸ごと保存する。ボディ検証は
 * createTransaction と同じくハンドラ側で行う（503 を 400 より先に返す）。
 * 置き換えの本体は services/transactions/replaceYearTransactions（MCP と共用）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { transactionToApi } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListTransactionsResponse,
  ListTransactionsResponseSchema,
  ReplaceYearTransactionsRequestSchema,
} from "../schemas/transaction";
import { replaceYearTransactions } from "../services/transactions/replaceYearTransactions";

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
  const db = requireDb();
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = ReplaceYearTransactionsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "year と transactions が必要です" });
  }
  const rows = await replaceYearTransactions(db, parsed.data);
  const response: ListTransactionsResponse = {
    count: rows.length,
    transactions: rows.map(transactionToApi),
  };
  return c.json(response, 200);
};
