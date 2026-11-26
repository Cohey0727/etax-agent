import { API_URL } from "../config";

export type LoginResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

async function readErrorMessage(resp: Response): Promise<string> {
  const data = (await resp.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `HTTP ${resp.status}`;
}

/** メールアドレスとパスワードでログインする。成功時はサーバーがセッションを発行する。 */
export async function login(email: string, password: string): Promise<LoginResult> {
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, status: 0, message: "ネットワークに接続できませんでした" };
  }
  if (resp.ok) return { ok: true };
  return { ok: false, status: resp.status, message: await readErrorMessage(resp) };
}
