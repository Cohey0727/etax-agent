/**
 * receipts.ts — 領収書（証憑）の解析・一覧・紐付けのAPI。
 * 解析は署名付きURLでアップロードしてファイルIDで依頼し、
 * アップロードできない場合は画像を Base64 で直接渡す。
 */
import { apiJson, apiJsonOrNull, ApiError, LONG_TIMEOUT_MS } from "./client";
import { encodeBase64, readLocalFileBytes, uploadViaPresignedUrl, UPLOADABLE_IMAGE_TYPES } from "./files";
import { AnalyzeReceiptResponse, ReceiptRecord } from "./types";

/** 領収書の解析結果と、証憑台帳に記録されたファイルID（Base64 経路では記録されないので null）。 */
export interface AnalyzedReceipt {
  result: AnalyzeReceiptResponse;
  fileId: string | null;
}

/**
 * 領収書画像（端末上のURI）を読み取り、科目判定まで済んだ下書きを返す。
 * Base64 の直接渡しへ落とすのは、ファイルをアップロードできなかったときだけ。
 * 解析そのものの失敗はやり直さずに返す（同じ画像で解析を2回走らせない）。
 */
export async function analyzeReceiptImage(
  uri: string,
  mimeType: string,
): Promise<AnalyzedReceipt> {
  const bytes = await readLocalFileBytes(uri);
  if (UPLOADABLE_IMAGE_TYPES.includes(mimeType)) {
    const fileId = await uploadViaPresignedUrl(bytes, mimeType).catch(() => null);
    if (fileId) {
      const result = await apiJson<AnalyzeReceiptResponse>("/api/receipts/analyze", {
        method: "POST",
        body: { fileId },
        timeoutMs: LONG_TIMEOUT_MS,
      });
      return { result, fileId };
    }
  }
  const result = await apiJson<AnalyzeReceiptResponse>("/api/receipts/analyze", {
    method: "POST",
    body: { imageBase64: encodeBase64(bytes), mimeType },
    timeoutMs: LONG_TIMEOUT_MS,
  });
  return { result, fileId: null };
}

/** 証憑の一覧を取得する。DB未接続の場合は null。 */
export async function fetchReceipts(): Promise<ReceiptRecord[] | null> {
  const data = await apiJsonOrNull<{ receipts: ReceiptRecord[] }>("/api/receipts");
  return data?.receipts ?? null;
}

/** 証憑を取引へ紐付ける。 */
export async function linkReceipt(
  fileId: string,
  transactionId: number,
): Promise<ReceiptRecord> {
  const data = await apiJson<{ receipt: ReceiptRecord | null }>(
    `/api/receipts/${fileId}/link`,
    { method: "POST", body: { transaction_id: transactionId } },
  );
  if (!data.receipt) throw new ApiError(500, "証憑の紐付けに失敗しました");
  return data.receipt;
}

/** 証憑と取引の紐付けを外す。 */
export async function unlinkReceipt(fileId: string): Promise<void> {
  await apiJson(`/api/receipts/${fileId}/link`, { method: "DELETE" });
}

/** 証憑画像の配信パス（表示時は認証付きで取得する）。 */
export function receiptContentPath(fileId: string): string {
  return `/api/receipts/${fileId}/content`;
}
