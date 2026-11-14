/**
 * readJsonBody.ts — リクエストボディを JSON オブジェクトとして読む（lib）。
 *
 * フレームワークのバリデーションを通さずにハンドラ側で検証する
 * エンドポイント（DBゲートやキーゲートをバリデーションより先に通す
 * 必要があるもの）で使う。JSON として読めない・オブジェクトでない
 * 場合は null を返す。
 */

/** ボディを JSON オブジェクトとして読む。読めなければ null。 */
export async function readJsonBody(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await c.req.json();
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
