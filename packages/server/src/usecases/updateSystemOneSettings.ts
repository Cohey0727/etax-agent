/**
 * updateSystemOneSettings.ts — SystemOne（jev）接続設定の保存ユースケース。
 * 保存した値はその場で有効になり、以降の科目判定すべてに使われる。
 * APIキーは「新しい値が来たら差し替え、来なければ維持、clearApiKey で削除」。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { loadSystemOneConfig } from "../lib/config";
import {
  SystemOneSettingsInputError,
  updateSystemOneSettings,
} from "../services/classification/updateSystemOneSettings";
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
  let saved;
  try {
    saved = await updateSystemOneSettings({
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey,
    });
  } catch (e) {
    if (e instanceof SystemOneSettingsInputError) {
      throw new HTTPException(400, { message: e.message });
    }
    throw e;
  }
  return c.json(toSystemOneSettingsResponse(saved, loadSystemOneConfig()), 200);
};
