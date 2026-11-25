/**
 * authApiKeys.ts — 外部エージェント（MCP）接続用 API キーの発行・一覧・失効（usecases）。
 * 平文キーは発行時のレスポンスでだけ返す（DBにはハッシュのみ）。
 * 発行・失効は権限昇格にあたるため MCP ツール化せず、この画面（人間の操作）だけが正規経路。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import {
  apiKeyStatus,
  createApiKey,
  listApiKeyRows,
  revokeApiKeyRow,
} from "../repositories/userRepository";
import { ApiKeyRow } from "../repositories/schema";
import { ApiKeyResponseSchema, CreateApiKeyRequestSchema } from "../schemas/auth";

function requireUser(c: Context): { db: NonNullable<ReturnType<typeof getDb>>; userId: number } {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const userId = currentUserId();
  if (userId === undefined) throw new HTTPException(401, { message: "ログインしていません" });
  return { db, userId };
}

function keyToApi(row: ApiKeyRow): z.infer<typeof ApiKeyResponseSchema> {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.keyPrefix,
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
    status: apiKeyStatus(row),
    created_at: row.createdAt.toISOString(),
  };
}

/** 有効期限の入力を検証する。null・未指定は無期限（null を返す）。過去・解釈不能は 400。 */
function parseExpiresAt(input: string | null | undefined): Date | null {
  if (input === null || input === undefined) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new HTTPException(400, { message: "有効期限の形式が不正です" });
  }
  if (date.getTime() <= Date.now()) {
    throw new HTTPException(400, { message: "有効期限には未来の日時を指定してください" });
  }
  return date;
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
  const body = c.req.valid("json");
  const expiresAt = parseExpiresAt(body.expires_at);
  const { row, key } = await createApiKey(db, userId, body.name, expiresAt);
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

export const revokeApiKeyRoute = createRoute({
  method: "delete",
  path: "/api/auth/api-keys/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ revoked: z.boolean() }) } },
      description: "APIキーを失効させた（行は履歴として残る）",
    },
  },
});

export const revokeApiKeyHandler: RouteHandler<typeof revokeApiKeyRoute> = async (c) => {
  const { db, userId } = requireUser(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "id が不正です" });
  const revoked = await revokeApiKeyRow(db, userId, id);
  if (!revoked) throw new HTTPException(404, { message: "APIキーが見つかりません" });
  return c.json({ revoked: true });
};
