/**
 * getJevPrompt.ts — jev 用プロンプトの取得ユースケース。
 * 手編集されたカスタムプロンプト、学習履歴からの自動生成プロンプト、
 * 実際に使われるプロンプト（カスタム優先）をまとめて返す。
 * 設定画面の「AIのメモリー」のプロンプト編集欄が使う。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { JevPromptResponseSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { buildJevPromptView } from "../services/classification/jevPromptView";

export const getJevPromptRoute = createRoute({
  method: "get",
  path: "/api/classify/jev-prompt",
  operationId: "getJevPrompt",
  tags: ["Classify"],
  summary: "jev用プロンプト（カスタム／自動生成／実効）を取得する",
  responses: {
    200: {
      content: { "application/json": { schema: JevPromptResponseSchema } },
      description: "jev用プロンプト一式",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "サーバーエラー",
    },
  },
});

export const getJevPromptHandler: RouteHandler<typeof getJevPromptRoute> = async (c) => {
  return c.json(await buildJevPromptView(), 200);
};
