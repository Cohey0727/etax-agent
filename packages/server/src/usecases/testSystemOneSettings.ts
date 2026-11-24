/**
 * testSystemOneSettings.ts — SystemOne（jev）接続テストのユースケース。
 * フォームの未保存の値でもテストできるよう、送られた項目だけ現在の
 * 有効値に上書きしてダミー判定を1回投げる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { ACCOUNT_CRITERIA } from "@etax/shared";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import {
  getSystemOneOverrides,
  loadSystemOneConfig,
  pairApiKeyWithBaseUrl,
  SystemOneConfig,
} from "../lib/config";
import { assertSafeUserBaseUrl } from "../lib/ssrfGuard";
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
  const overrides = getSystemOneOverrides();
  // 宛先とキーの出所を揃える: カスタム宛先（入力値または保存済み）には
  // ユーザー自身のキーだけを組み合わせ、環境変数のキーは送らない。
  const customBaseUrl = body.baseUrl?.trim() || overrides.baseUrl || null;
  if (customBaseUrl) {
    try {
      await assertSafeUserBaseUrl(customBaseUrl);
    } catch (e) {
      return c.json(
        { ok: false, top: null, error: e instanceof Error ? e.message : String(e) },
        200,
      );
    }
  }
  const paired = pairApiKeyWithBaseUrl({
    customBaseUrl,
    serverBaseUrl: process.env.SYSTEMONE_BASE_URL || "http://127.0.0.1:11434",
    userKey: body.apiKey?.trim() || overrides.apiKey || null,
    serverKey: process.env.SYSTEMONE_API_KEY || null,
  });
  const config: SystemOneConfig = {
    baseUrl: paired.baseUrl,
    apiKey: paired.apiKey,
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
