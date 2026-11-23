/**
 * authApiKeys.ts — 外部エージェント（MCP）接続用 API キーの発行・一覧・削除（usecases）。
 * 平文キーは発行時のレスポンスでだけ返す（DBにはハッシュのみ）。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import {
  createApiKey,
  deleteApiKeyRow,
  listApiKeyRows,
} from "../repositories/userRepository";
import { ApiKeyResponseSchema, CreateApiKeyRequestSchema } from "../schemas/auth";

function requireUser(c: Context): { db: NonNullable<ReturnType<typeof getDb>>; userId: number } {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const userId = currentUserId();
  if (userId === undefined) throw new HTTPException(401, { message: "ログインしていません" });
  return { db, userId };
}

function keyToApi(row: {
  id: number;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}): z.infer<typeof ApiKeyResponseSchema> {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.keyPrefix,
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export const createApiKeyRoute = createRoute({
  method: "post",
  path: "/api/auth/api-keys",
  request: {
    body: { content: { "application/json": { schema: CreateApiKeyRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ApiKeyResponseSchema } },
      description: "APIキーを発行した（平文キーはこの応答でのみ返す）",
    },
  },
});

export const createApiKeyHandler: RouteHandler<typeof createApiKeyRoute> = async (c) => {
  const { db, userId } = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body?.name === "string" ? body.name.slice(0, 100) : "";
  const { row, key } = await createApiKey(db, userId, name);
  return c.json({ ...keyToApi(row), key });
};

export const listApiKeysRoute = createRoute({
  method: "get",
  path: "/api/auth/api-keys",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ApiKeyResponseSchema) } },
      description: "自分のAPIキー一覧",
    },
  },
});

export const listApiKeysHandler: RouteHandler<typeof listApiKeysRoute> = async (c) => {
  const { db, userId } = requireUser(c);
  const rows = await listApiKeyRows(db, userId);
  return c.json(rows.map(keyToApi));
};

export const deleteApiKeyRoute = createRoute({
  method: "delete",
  path: "/api/auth/api-keys/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } },
      description: "APIキーを削除した",
    },
  },
});

export const deleteApiKeyHandler: RouteHandler<typeof deleteApiKeyRoute> = async (c) => {
  const { db, userId } = requireUser(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "id が不正です" });
  const deleted = await deleteApiKeyRow(db, userId, id);
  if (!deleted) throw new HTTPException(404, { message: "APIキーが見つかりません" });
  return c.json({ deleted: true });
};
