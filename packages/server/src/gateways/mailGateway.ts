/**
 * mailGateway.ts — 送信メールの接続点（gateways）。送信は Resend の API を使う。
 *
 * 公式 SDK は入れず、fetch で呼んで応答を zod で検証する。
 * RESEND_API_KEY が未設定なら送信せず false を返し、呼び出し側の処理
 * （マジックリンク発行など）は壊れない。開発時に内容を確認できるよう、
 * 未設定時は標準出力へ宛先と件名だけを出す（本文のリンクは出さない）。
 */
import { z } from "@hono/zod-openapi";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** 送信を受け付けたときの Resend の応答（送信 ID）。 */
const sendEmailResponseSchema = z.object({ id: z.string().min(1) });

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function mailFrom(): string {
  return process.env.RESEND_FROM || "eTaxAgent <onboarding@resend.dev>";
}

/** メールを1通送る。送信を受け付けられたら true、未設定・失敗なら false。 */
export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[mail] RESEND_API_KEY 未設定のため送信を省略: to=${input.to} subject=${input.subject}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      console.error(`[mail] Resend 送信失敗: ${res.status}`);
      return false;
    }
    const parsed = sendEmailResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      console.error("[mail] Resend の応答に送信 ID がありません");
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[mail] Resend 送信エラー: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
