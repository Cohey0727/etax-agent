/**
 * getClassificationHistory.ts — AIのメモリー（科目判定の学習履歴）の取得ユースケース。
 *
 * ユーザーが確定・修正した「摘要 → 勘定科目」の対応そのものを返す。
 * 設定画面の「AIのメモリー」で中身を確認できるようにするための読み取り専用API。
 * 並びは「よく使う対応が上」（回数の多い順、同数なら新しい順）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import { ClassificationHistoryResponseSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";

const MAX_RECORDS = 500;

export const getClassificationHistoryRoute = createRoute({
  method: "get",
  path: "/api/classify/history",
  operationId: "getClassificationHistory",
  tags: ["Classify"],
  summary: "科目判定の学習履歴（AIのメモリー）",
  responses: {
    200: {
      content: { "application/json": { schema: ClassificationHistoryResponseSchema } },
      description: "学習履歴の一覧",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "履歴の読み込みに失敗",
    },
  },
});

export const getClassificationHistoryHandler: RouteHandler<
  typeof getClassificationHistoryRoute
> = async (c) => {
  const history = await loadClassificationHistory();
  const sorted = [...history].sort((a, b) =>
    b.count !== a.count ? b.count - a.count : b.updatedAt.localeCompare(a.updatedAt),
  );
  return c.json(
    {
      records: sorted.slice(0, MAX_RECORDS).map((r) => ({
        description: r.description,
        account: r.account,
        count: r.count,
        updatedAt: r.updatedAt,
      })),
      total: history.length,
    },
    200,
  );
};
