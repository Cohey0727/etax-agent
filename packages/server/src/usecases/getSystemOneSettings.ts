/**
 * getSystemOneSettings.ts — SystemOne（jev）接続設定の取得ユースケース。
 * APIキーの実値は返さず、設定済みかどうかだけを返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { getSystemOneOverrides, loadSystemOneConfig } from "../lib/config";
import { SystemOneSettingsResponseSchema } from "../schemas/systemOneSettings";
import { ErrorSchema } from "../schemas/common";
import { toSystemOneSettingsResponse } from "./systemOneSettingsView";

export const getSystemOneSettingsRoute = createRoute({
  method: "get",
  path: "/api/settings/systemone",
  operationId: "getSystemOneSettings",
  tags: ["Settings"],
  summary: "SystemOne（jev）接続設定の取得",
  responses: {
    200: {
      content: { "application/json": { schema: SystemOneSettingsResponseSchema } },
      description: "現在の接続設定（APIキーは有無のみ）",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "設定の取得に失敗",
    },
  },
});

export const getSystemOneSettingsHandler: RouteHandler<
  typeof getSystemOneSettingsRoute
> = async (c) => {
  return c.json(
    toSystemOneSettingsResponse(getSystemOneOverrides(), loadSystemOneConfig()),
    200,
  );
};
