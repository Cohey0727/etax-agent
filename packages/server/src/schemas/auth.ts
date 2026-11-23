/**
 * auth.ts — 認証（登録・ログイン・セッション・APIキー）のスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const RegisterRequestSchema = z
  .object({
    email: z.string().email().openapi({ description: "メールアドレス" }),
    password: z.string().min(8).openapi({ description: "パスワード（8文字以上）" }),
  })
  .openapi("RegisterRequest");

export const LoginRequestSchema = z
  .object({
    email: z.string().email().openapi({ description: "メールアドレス" }),
    password: z.string().min(1).openapi({ description: "パスワード" }),
  })
  .openapi("LoginRequest");

export const AuthSessionResponseSchema = z
  .object({
    user: z.object({ id: z.number(), email: z.string() }),
    /** セッショントークン（Cookie にも同じ値を設定する） */
    token: z.string(),
  })
  .openapi("AuthSessionResponse");

export const CreateApiKeyRequestSchema = z
  .object({
    name: z.string().max(100).default("").openapi({ description: "キーの名前（用途メモ）" }),
  })
  .openapi("CreateApiKeyRequest");

export const ApiKeyResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    key_prefix: z.string(),
    /** 発行時のみ平文キーを返す */
    key: z.string().optional(),
    last_used_at: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi("ApiKeyResponse");
