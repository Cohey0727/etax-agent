/**
 * updateRegexRules.ts — 正規表現ルールの保存ユースケース。
 * 設定画面の「AIのメモリー」で編集されたルール一式を保存する。
 * 保存されたルールは科目判定で自動生成より優先される（実効ルールになる）。
 * 空配列で保存するとカスタムが消え、自動生成に戻る。
 * パターンの正当性と科目の実在は validateRegexRules で検証する。
 * 結果としてルール一式（カスタム／自動生成／実効）を返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { saveRegexRulesOverride } from "../repositories/regexRulesRepository";
import { RegexRulesResponseSchema, UpdateRegexRulesRequestSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { buildRegexRulesView } from "../services/classification/regexRulesView";
import { validateRegexRules } from "../services/classification/validateRegexRules";

export const updateRegexRulesRoute = createRoute({
  method: "put",
  path: "/api/classify/regex-rules",
  operationId: "updateRegexRules",
  tags: ["Classify"],
  summary: "正規表現ルールを保存する（空配列で自動生成に戻る）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateRegexRulesRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: RegexRulesResponseSchema } },
      description: "保存後の正規表現ルール一式",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ルールが不正（正規表現として不正・科目が存在しない等）",
    },
  },
});

export const updateRegexRulesHandler: RouteHandler<typeof updateRegexRulesRoute> = async (c) => {
  const body = c.req.valid("json");
  const validated = validateRegexRules(body.rules);
  if (!validated.ok) {
    throw new HTTPException(400, { message: validated.message });
  }
  await saveRegexRulesOverride(validated.rules);
  return c.json(await buildRegexRulesView(), 200);
};
