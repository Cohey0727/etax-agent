/**
 * updateJevPrompt.ts — jev 用プロンプトの保存ユースケース。
 * 設定画面の「AIのメモリー」で編集されたプロンプトを保存する。
 * 保存されたプロンプトは科目判定で自動生成より優先される。
 * 空文字で保存するとカスタムが消え、自動生成に戻る。
 * 結果としてプロンプト一式（カスタム／自動生成／実効）を返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { saveJevPromptOverride } from "../repositories/jevPromptRepository";
import { JevPromptResponseSchema, UpdateJevPromptRequestSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { buildJevPromptView } from "../services/classification/jevPromptView";

export const updateJevPromptRoute = createRoute({
  method: "put",
  path: "/api/classify/jev-prompt",
  operationId: "updateJevPrompt",
  tags: ["Classify"],
  summary: "jev用プロンプトを保存する（空文字で自動生成に戻る）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateJevPromptRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: JevPromptResponseSchema } },
      description: "保存後のjev用プロンプト一式",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const updateJevPromptHandler: RouteHandler<typeof updateJevPromptRoute> = async (c) => {
  const body = c.req.valid("json");
  await saveJevPromptOverride(body.prompt);
  return c.json(await buildJevPromptView(), 200);
};
