/**
 * testSystemOneSettings.ts — SystemOne（jev）接続テストのユースケース。
 * フォームの未保存の値でもテストできるよう、送られた項目だけ現在の
 * 有効値に上書きしてダミー判定を1回投げる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { ACCOUNT_CRITERIA } from "@etax/shared";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import { loadSystemOneConfig, SystemOneConfig } from "../lib/config";
import {
  TestSystemOneSettingsRequestSchema,
  TestSystemOneSettingsResponseSchema,
} from "../schemas/systemOneSettings";
import { ErrorSchema } from "../schemas/common";

export const testSystemOneSettingsRoute = createRoute({
  method: "post",
  path: "/api/settings/systemone/test",
  operationId: "testSystemOneSettings",
  tags: ["Settings"],
  summary: "SystemOne（jev）接続テスト",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TestSystemOneSettingsRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TestSystemOneSettingsResponseSchema } },
      description: "接続テストの結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const testSystemOneSettingsHandler: RouteHandler<
  typeof testSystemOneSettingsRoute
> = async (c) => {
  const body = c.req.valid("json");
  const effective = loadSystemOneConfig();
  const typedKey = body.apiKey?.trim() ?? "";
  const config: SystemOneConfig = {
    baseUrl: body.baseUrl?.trim() ? body.baseUrl.trim().replace(/\/+$/, "") : effective.baseUrl,
    apiKey: typedKey ? typedKey : effective.apiKey,
    model: body.model?.trim() ? body.model.trim() : effective.model,
  };
  try {
    const client = createSystemOneClient(config);
    const judgement = await client.judgeAccount("コーヒー 打ち合わせ", ACCOUNT_CRITERIA);
    return c.json({ ok: true, top: judgement.top, error: null }, 200);
  } catch (e) {
    return c.json(
      { ok: false, top: null, error: e instanceof Error ? e.message : String(e) },
      200,
    );
  }
};
