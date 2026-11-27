/**
 * uploadTypes.ts — アップロード可能な Content-Type のホワイトリスト（lib）。
 *
 * 領収書アップロードは画像のみ。presign のスキーマ（schemas/file の
 * UploadableImageMimeTypeSchema）と領収書の解析もこのリストを使う。
 * 任意のタイプを許可すると、アップロードした HTML/SVG が自オリジンから
 * text/html で配信される Stored XSS になるため、受け入れ時と配信時の
 * 両方でこのリストに寄せる（Issue #7）。
 */
/**
 * 1ファイルのアップロードの上限（バイト）。API のリクエストボディの上限と
 * 同じ値にする。署名付き URL でストレージへ直接上げたファイルはボディ上限を
 * 通らないため、添付・解析の時点でストレージ上のサイズをこの上限で確かめる。
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** アップロードの上限を超えたときの文言。 */
export const UPLOAD_TOO_LARGE_MESSAGE = "ファイルが大きすぎます（25MBまで）";

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

/**
 * 文書アップロード（受信通知PDF）で許可する Content-Type。
 * 画像のリストとは分ける: PDF は領収書・固定資産画像の受け口では
 * 受け付けず、受信通知の受け口（presign の purpose=filing_receipt と
 * 添付時の検証）でのみ許可する。配信時は nosniff + CSP sandbox を
 * 併用し、PDF 内スクリプトを自オリジンで解釈させない。
 */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = ["application/pdf"] as const;

/** 文書ホワイトリストにある Content-Type か。 */
export function isAllowedDocumentContentType(contentType: string): boolean {
  return (ALLOWED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(contentType),
  );
}

/** 文書配信時に使う Content-Type を決める（servedContentType の文書版）。 */
export function servedDocumentContentType(storedContentType: string): string {
  const normalized = normalizeContentType(storedContentType);
  return isAllowedDocumentContentType(normalized) ? normalized : "application/octet-stream";
}
