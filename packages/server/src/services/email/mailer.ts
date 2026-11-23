/**
 * mailer.ts — 送信メール（services/email）。送信は Resend の API を使う。
 * RESEND_API_KEY が未設定なら送信せず false を返し、呼び出し側の処理
 * （マジックリンク発行など）は壊れない。開発時に内容を確認できるよう、
 * 未設定時は標準出力へ宛先と件名だけを出す（本文のリンクは出さない）。
 */

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function mailFrom(): string {
  return process.env.RESEND_FROM || "eTaxAgent <onboarding@resend.dev>";
}

/** メールを1通送る。送信できたら true、未設定・失敗なら false。 */
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
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
    return true;
  } catch (e) {
    console.error(`[mail] Resend 送信エラー: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
