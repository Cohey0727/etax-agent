/**
 * readJsonBody.ts — リクエストボディを JSON オブジェクトとして読む（lib）。
 *
 * フレームワークのバリデーションを通さずにハンドラ側で検証する
 * エンドポイント（DBゲートやキーゲートをバリデーションより先に通す
 * 必要があるもの）で使う。Content-Type が JSON でない・JSON として
 * 読めない・オブジェクトでない場合は null を返す。Content-Type を見るのは、
 * text/plain のボディはブラウザがプリフライト無しで他サイトから送れるため。
 */

/** JSON のメディアタイプ（application/json と application/*+json、パラメータ付きも可）。 */
const jsonContentType = /^application\/([\w.-]+\+)?json\s*(;|$)/i;

/** ボディを JSON オブジェクトとして読む。読めなければ null。 */
export async function readJsonBody(c: {
  req: { json: () => Promise<unknown>; header: (name: string) => string | undefined };
}): Promise<Record<string, unknown> | null> {
  if (!jsonContentType.test(c.req.header("content-type") ?? "")) return null;
  try {
    const v: unknown = await c.req.json();
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
