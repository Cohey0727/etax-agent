/**
 * stripeGateway.ts — Stripe API への接続（gateways）。
 *
 * 公式 SDK は導入せず、REST API（フォームエンコード）を fetch で叩く。
 * 料金は月額490円の Price（Stripe ダッシュボードで作成し、その ID を
 * 環境変数 STRIPE_PRICE_ID で渡す）。秘密鍵は STRIPE_SECRET_KEY、
 * Webhook 署名シークレットは STRIPE_WEBHOOK_SECRET。
 * いずれも未設定なら課金は無効（billingEnabled() === false）。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 課金が有効か（Stripe の鍵と Price が設定されているか）。 */
export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が未設定です");
  return key;
}

async function stripePost(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const message =
      (data.error as { message?: string } | undefined)?.message ?? `Stripe API エラー (${resp.status})`;
    throw new Error(message);
  }
  return data;
}

/**
 * サブスクリプション用の Checkout セッションを作り、決済ページの URL を返す。
 * 解約は期間末（Stripe 側の cancel_at_period_end 運用を基本とし、
 * ポータル/ダッシュボードで管理する）。
 */
export async function createCheckoutSession(input: {
  userId: number;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID が未設定です");
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", String(input.userId));
  params.set("metadata[user_id]", String(input.userId));
  params.set("subscription_data[metadata][user_id]", String(input.userId));
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  if (input.customerId) params.set("customer", input.customerId);
  else if (input.customerEmail) params.set("customer_email", input.customerEmail);
  const session = await stripePost("/checkout/sessions", params);
  return { id: String(session.id), url: String(session.url) };
}

const SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Stripe Webhook の署名を検証する（Stripe-Signature: t=...,v1=...）。
 * 署名対象は "<t>.<生ペイロード>" の HMAC-SHA256。
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;
  // 数値でないタイムスタンプは NaN になって許容範囲チェックをすり抜ける
  // ため、明示的に検証する（署名自体は秘密鍵が無ければ一致しないが多層防御）。
  const timestampSec = Number(timestamp);
  if (!Number.isFinite(timestampSec)) return false;
  if (Math.abs(nowSec - timestampSec) > SIGNATURE_TOLERANCE_SEC) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
