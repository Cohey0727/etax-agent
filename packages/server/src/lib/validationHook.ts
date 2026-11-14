/**
 * validationHook.ts — zod-openapi のバリデーション失敗を、従来の
 * `{ error: string }` 形式・従来文言の 400 レスポンスへ変換するフック（lib）。
 *
 * フレームワーク既定の zod エラー JSON は返さず、エンドポイントごとに
 * 従来どおりの日本語文言を返すため、メッセージ決定は呼び出し側の
 * 関数（issue のパス一覧 → 文言）に委ねる。
 */
import { Hook } from "@hono/zod-openapi";

/**
 * バリデーション失敗時の文言を決めるフックを作る。
 * messageFor には issue のパス（"." 連結文字列）一覧が渡される。
 */
export function legacyValidationHook(
  messageFor: (issuePaths: string[]) => string,
): Hook<any, any, any, any> {
  return (result, c) => {
    if (result.success) return;
    const issuePaths = result.error.issues.map((issue) =>
      issue.path.map((p) => String(p)).join("."),
    );
    return c.json({ error: messageFor(issuePaths) }, 400);
  };
}
