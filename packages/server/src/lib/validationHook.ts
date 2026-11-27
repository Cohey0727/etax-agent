/**
 * validationHook.ts — zod-openapi のバリデーション失敗を `{ error: string }`
 * 形式の 400 レスポンスへ変換するフック（lib）。
 *
 * フレームワーク既定の応答は error が zod エラーのオブジェクトで、画面は
 * 文言として表示できない。ルートアプリの defaultHook に defaultValidationHook
 * を置いて全ルートに効かせ、エンドポイント固有の文言が要るルートだけ
 * validationHook(messageFor) を個別に渡す。
 */
import { Hook } from "@hono/zod-openapi";

/**
 * バリデーション失敗時の文言を決めるフックを作る。
 * messageFor には issue のパス（"." 連結文字列）一覧が渡される。
 *
 * Hook の型引数はルートごとのスキーマ・応答型で決まるため、複数ルートで
 * 共有するこのファクトリでは具体型を名指しできない（unknown 等に寄せると
 * 応答型の位置で代入互換が崩れる）。any はこの1箇所に限定する。
 */
export function validationHook(
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

/** 失敗した項目名を並べた文言。項目を指さない失敗はボディ全体の不備とみなす。 */
export function defaultValidationMessage(issuePaths: string[]): string {
  const named = [...new Set(issuePaths.filter((path) => path !== ""))];
  return named.length > 0 ? `${named.join("・")} が不正です` : "JSONボディが必要です";
}

/** 個別の文言を持たないルートに使う defaultHook。 */
export const defaultValidationHook = validationHook(defaultValidationMessage);
