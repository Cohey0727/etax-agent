/**
 * getRegexRules.ts — 正規表現ルール一式の取得ユースケース。
 * 手編集されたカスタムルール、学習履歴からの自動生成ルール、
 * 実際に使われる実効ルール（カスタム優先）をまとめて返す。
 * 設定画面の「AIのメモリー」のルール編集欄が使う。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { RegexRulesResponseSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { buildRegexRulesView } from "../services/classification/regexRulesView";

export const getRegexRulesRoute = createRoute({
  method: "get",
  path: "/api/classify/regex-rules",
  operationId: "getRegexRules",
  tags: ["Classify"],
  summary: "正規表現ルール（カスタム／自動生成／実効）を取得する",
  responses: {
    200: {
      content: { "application/json": { schema: RegexRulesResponseSchema } },
      description: "正規表現ルール一式",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "サーバーエラー",
    },
  },
});

export const getRegexRulesHandler: RouteHandler<typeof getRegexRulesRoute> = async (c) => {
  return c.json(await buildRegexRulesView(), 200);
};
