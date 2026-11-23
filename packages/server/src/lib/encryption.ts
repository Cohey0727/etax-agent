/**
 * encryption.ts — 機微項目の保存時暗号化（lib）。
 *
 * 方式: AES-256-GCM。鍵はサーバー側の環境変数 ETAX_ENCRYPTION_KEY
 * （Base64 の 32 バイト）で管理する（SaaS 運用ではデプロイ基盤の
 * シークレット管理から注入する前提）。鍵が未設定の環境（従来の
 * ローカル運用）では暗号化せず平文のまま読み書きする。
 *
 * 保存形式: "enc:v1:<iv>:<認証タグ>:<暗号文>"（各 Base64）。
 * プレフィックスの無い値は平文としてそのまま返すため、暗号化を
 * 有効化する前に保存された既存データも読み続けられる（書き込みは
 * 常に暗号化されるので、再保存された行から順に移行する）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;

function loadKey(): Buffer | null {
  const raw = process.env.ETAX_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ETAX_ENCRYPTION_KEY は Base64 の 32 バイト鍵で指定してください");
  }
  return key;
}

/** 暗号化が有効か（鍵が設定されているか）。 */
export function encryptionEnabled(): boolean {
  return Boolean(process.env.ETAX_ENCRYPTION_KEY);
}

/** 値を暗号化する。空文字はそのまま、鍵未設定なら平文のまま返す。 */
export function encryptField(plain: string): string {
  if (plain === "") return plain;
  const key = loadKey();
  if (!key) return plain;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** 暗号化された値を復号する。平文（プレフィックスなし）はそのまま返す。 */
export function decryptField(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const key = loadKey();
  if (!key) {
    throw new Error("暗号化された値がありますが ETAX_ENCRYPTION_KEY が未設定です");
  }
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("暗号化データの形式が不正です");
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
