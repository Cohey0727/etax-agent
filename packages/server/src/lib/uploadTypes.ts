/**
 * uploadTypes.ts — アップロード可能な Content-Type のホワイトリスト（lib）。
 *
 * 領収書アップロードは画像のみ。presign のスキーマ（schemas/file の
 * UploadableImageMimeTypeSchema）と同じ値を使うこと。
 * 任意のタイプを許可すると、アップロードした HTML/SVG が自オリジンから
 * text/html で配信される Stored XSS になるため、受け入れ時と配信時の
 * 両方でこのリストに寄せる（Issue #7）。
 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Content-Type ヘッダを正規化する（パラメータ除去・小文字化）。 */
export function normalizeContentType(header: string | undefined | null): string {
  if (!header) return "";
  return header.split(";")[0]!.trim().toLowerCase();
}

/** ホワイトリストにある Content-Type か。 */
export function isAllowedUploadContentType(contentType: string): boolean {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(contentType),
  );
}

/**
 * 配信時に使う Content-Type を決める。保存済みメタがホワイトリストに
 * 無ければ application/octet-stream に落とす（過去に紛れた不正タイプを
 * ブラウザに解釈させない）。
 */
export function servedContentType(storedContentType: string): string {
  const normalized = normalizeContentType(storedContentType);
  return isAllowedUploadContentType(normalized) ? normalized : "application/octet-stream";
}
