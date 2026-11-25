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
    user: z.object({
      id: z.number(),
      email: z.string(),
      totp_enabled: z.boolean().optional(),
    }),
    /** セッショントークン（Cookie にも同じ値を設定する） */
    token: z.string(),
  })
  .openapi("AuthSessionResponse");

/** 登録直後の応答（SaaS 運用ではメール確認が済むまでセッションを発行しない）。 */
export const EmailVerificationPendingResponseSchema = z
  .object({
    verification_required: z.literal(true),
  })
  .openapi("EmailVerificationPendingResponse");

export const VerifyEmailRequestSchema = z
  .object({
    token: z.string().openapi({ description: "確認メールで受け取ったトークン" }),
  })
  .openapi("VerifyEmailRequest");

/** ログインで TOTP が必要なときの応答（セッションはまだ発行しない）。 */
export const TotpChallengeResponseSchema = z
  .object({
    totp_required: z.literal(true),
    /** 2段階目の検証に渡す短期チャレンジ */
    challenge: z.string(),
  })
  .openapi("TotpChallengeResponse");

export const LoginTotpRequestSchema = z
  .object({
    challenge: z.string().openapi({ description: "ログイン応答のチャレンジ" }),
    code: z.string().openapi({ description: "Authenticator アプリの6桁コード" }),
  })
  .openapi("LoginTotpRequest");

export const TotpCodeRequestSchema = z
  .object({
    code: z.string().openapi({ description: "Authenticator アプリの6桁コード" }),
  })
  .openapi("TotpCodeRequest");

export const TotpSetupResponseSchema = z
  .object({
    /** 登録用 otpauth URL（QRコード化してアプリで読み取る） */
    otpauth_url: z.string(),
    /** 手入力用の秘密（Base32） */
    secret: z.string(),
  })
  .openapi("TotpSetupResponse");

export const MagicLinkRequestSchema = z
  .object({
    email: z.string().email().openapi({ description: "メールアドレス" }),
  })
  .openapi("MagicLinkRequest");

export const MagicLinkConsumeRequestSchema = z
  .object({
    token: z.string().openapi({ description: "メールで受け取ったトークン" }),
  })
  .openapi("MagicLinkConsumeRequest");

/** 認証まわりの公開設定（画面が表示方法を決めるために使う）。 */
export const AuthConfigResponseSchema = z
  .object({
    /** ETAX_AUTH_MODE=required か（true ならログイン必須） */
    required: z.boolean(),
    methods: z.object({
      password: z.boolean(),
      magic_link: z.boolean(),
      totp: z.boolean(),
      passkey: z.boolean(),
      google: z.boolean(),
      github: z.boolean(),
    }),
  })
  .openapi("AuthConfigResponse");

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
