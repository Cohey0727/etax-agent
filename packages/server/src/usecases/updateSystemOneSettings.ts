/**
 * updateSystemOneSettings.ts — SystemOne（jev）接続設定の保存ユースケース。
 * 保存した値はその場で有効になり、以降の科目判定すべてに使われる。
 * APIキーは「新しい値が来たら差し替え、来なければ維持、clearApiKey で削除」。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  getSystemOneOverrides,
  loadSystemOneConfig,
  SystemOneOverrides,
} from "../lib/config";
import { assertSafeUserBaseUrl, UnsafeUrlError } from "../lib/ssrfGuard";
import { saveSystemOneSettings } from "../repositories/systemOneSettingsRepository";
import {
  SystemOneSettingsResponseSchema,
  UpdateSystemOneSettingsRequestSchema,
} from "../schemas/systemOneSettings";
import { ErrorSchema } from "../schemas/common";
import { toSystemOneSettingsResponse } from "./systemOneSettingsView";

export const updateSystemOneSettingsRoute = createRoute({
  method: "put",
  path: "/api/settings/systemone",
  operationId: "updateSystemOneSettings",
  tags: ["Settings"],
  summary: "SystemOne（jev）接続設定の保存",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateSystemOneSettingsRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SystemOneSettingsResponseSchema } },
      description: "保存後の接続設定",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const updateSystemOneSettingsHandler: RouteHandler<
  typeof updateSystemOneSettingsRoute
> = async (c) => {
  const body = c.req.valid("json");
  const current = getSystemOneOverrides();
  const next: SystemOneOverrides = {};
  const baseUrl = body.baseUrl.trim();
  if (baseUrl) {
    // ユーザー指定の接続先は保存前に SSRF 検証する。
    try {
      await assertSafeUserBaseUrl(baseUrl);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new HTTPException(400, { message: e.message });
      throw e;
    }
    next.baseUrl = baseUrl;
  }
  const model = body.model.trim();
  if (model) next.model = model;
  const newKey = body.apiKey?.trim() ?? "";
  // 削除指定が最優先。新しい値が来たら差し替え、来なければ既存を維持する。
  if (!body.clearApiKey && newKey) next.apiKey = newKey;
  if (!body.clearApiKey && !newKey && current.apiKey) next.apiKey = current.apiKey;
  await saveSystemOneSettings(next);
  return c.json(toSystemOneSettingsResponse(next, loadSystemOneConfig()), 200);
};
