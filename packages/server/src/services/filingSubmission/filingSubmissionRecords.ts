/**
 * filingSubmissionRecords.ts — 提出の記録（受付番号・提出日・受信通知PDF）の
 * 保存・削除・添付・取得の共通処理（services/filingSubmission）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う。受付番号が記録
 * されたら申告ステータスの「提出済み」を立てる連動、受信通知の差し替え
 * 時の旧ファイル削除、添付の重複チェック（1ファイル1提出記録）をここへ
 * 集約する。変更履歴はリポジトリ側で記録される（電帳法の訂正・削除履歴）。
 * ここで扱うのは「記録」までで、e-Tax への送信そのものは行わない。
 */
import {
  createStorageClient,
  filingReceiptObjectKey,
  StorageObjectNotFoundError,
} from "../../gateways/storageGateway";
import { loadStorageConfig } from "../../lib/config";
import { Db } from "../../lib/db";
import {
  deleteFilingSubmissionRow,
  filingSubmissionToApi,
  getFilingSubmissionRow,
  getFilingSubmissionRowByFileId,
  upsertFilingSubmissionRow,
} from "../../repositories/filingSubmissionRepository";
import {
  listFilingStatusRows,
  upsertFilingStatusRow,
} from "../../repositories/filingStatusRepository";
import {
  FilingSubmissionKind,
  FilingSubmissionResponse,
  SaveFilingSubmissionRequest,
} from "../../schemas/filingSubmission";
import { servedDocumentContentType } from "../../lib/uploadTypes";
import { BusinessError } from "../../lib/errors";

/** 提出記録まわりの業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class FilingSubmissionError extends BusinessError {}

/**
 * 提出記録を保存する。受付番号が記録されたら、申告ステータスの
 * 「提出済み」を立てる（提出の証跡があるのにステータスが未提出のままに
 * ならないようにする連動）。すでに提出済みなら、提出日時は最初に立てた
 * ときのまま変えない（記録の訂正で日時が動かないようにする）。
 */
export async function saveFilingSubmissionRecord(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
  request: SaveFilingSubmissionRequest,
): Promise<FilingSubmissionResponse> {
  const acceptanceNumber = request.acceptance_number.trim();
  const submittedDate = request.submitted_date ?? null;
  const row = await upsertFilingSubmissionRow(db, year, kind, {
    acceptanceNumber,
    submittedDate,
  });
  if (acceptanceNumber !== "") {
    const status = (await listFilingStatusRows(db)).find((row) => row.year === year);
    if (!status?.submittedAt) await upsertFilingStatusRow(db, year, { submitted: true });
  }
  return filingSubmissionToApi(row);
}

/** 提出記録を削除する。添付済みの受信通知PDFの実体もあわせて消す。 */
export async function deleteFilingSubmissionRecord(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
): Promise<void> {
  const removed = await deleteFilingSubmissionRow(db, year, kind);
  if (!removed) {
    throw new FilingSubmissionError(404, "対象の提出記録が見つかりません");
  }
  if (removed.receiptFileId) {
    const storage = createStorageClient(loadStorageConfig());
    await storage
      .deleteObject(filingReceiptObjectKey(removed.receiptFileId))
      .catch(() => undefined);
  }
}

/**
 * 受信通知PDFを提出記録へ添付する。アップロード済みオブジェクトの実在
 * 確認と形式検証は呼び出し側の責務（REST は presign 経由、MCP は直接
 * アップロード経由で検証してから呼ぶ）。1つのファイルを複数の提出記録へ
 * 使い回すことはできない。差し替え時は旧ファイルの実体を消す。
 */
export async function attachFilingReceiptRecord(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
  fileId: string,
  mimeType: string,
): Promise<FilingSubmissionResponse> {
  const existing = await getFilingSubmissionRowByFileId(db, fileId);
  if (existing) {
    throw new FilingSubmissionError(409, "このファイルは添付済みです");
  }
  const before = await getFilingSubmissionRow(db, year, kind);
  const row = await upsertFilingSubmissionRow(db, year, kind, {
    receiptFileId: fileId,
    receiptMimeType: mimeType,
  });
  if (before?.receiptFileId && before.receiptFileId !== fileId) {
    const storage = createStorageClient(loadStorageConfig());
    await storage
      .deleteObject(filingReceiptObjectKey(before.receiptFileId))
      .catch(() => undefined);
  }
  return filingSubmissionToApi(row);
}

/** 添付済みの受信通知PDFの実体を返す。 */
export async function getFilingReceiptBytes(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
): Promise<{ filename: string; mimeType: string; dataBase64: string }> {
  const row = await getFilingSubmissionRow(db, year, kind);
  if (!row?.receiptFileId) {
    throw new FilingSubmissionError(404, "受信通知が添付されていません");
  }
  const storage = createStorageClient(loadStorageConfig());
  let downloaded;
  try {
    downloaded = await storage.download(filingReceiptObjectKey(row.receiptFileId));
  } catch (e) {
    if (e instanceof StorageObjectNotFoundError) {
      throw new FilingSubmissionError(404, e.message);
    }
    throw e;
  }
  return {
    filename: "etax-receipt-notice.pdf",
    mimeType: servedDocumentContentType(row.receiptMimeType),
    dataBase64: downloaded.dataBase64,
  };
}
