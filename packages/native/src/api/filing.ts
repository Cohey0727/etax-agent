/**
 * filing.ts — 申告ステータス・申告入力・提出の記録・納税者プロフィール・
 * 開業入力・e-Tax 出力のAPI。
 */
import { apiJson, apiJsonOrNull } from "./client";
import { readLocalFileBytes, uploadViaPresignedUrl } from "./files";
import {
  BusinessStartInputs,
  BusinessStartInputsResponse,
  ExportBusinessStartPdfRequest,
  ExportBusinessStartPdfResponse,
  ExportConsumptionXtxRequest,
  ExportConsumptionXtxResponse,
  ExportReturnPdfResponse,
  ExportXtxRequest,
  ExportXtxResponse,
  FilingSnapshot,
  FilingSnapshotFigures,
  FilingStatus,
  FilingSubmission,
  FilingSubmissionHistoryEntry,
  FilingSubmissionKind,
  TaxpayerProfileResult,
  XtxTaxpayerInput,
} from "./types";

/* ---------- 申告ステータス ---------- */

/** 申告ステータス一覧。取得できない場合は null。 */
export async function fetchFilingStatuses(): Promise<FilingStatus[] | null> {
  const data = await apiJsonOrNull<{ statuses: FilingStatus[] }>("/api/filing-status");
  return data?.statuses ?? null;
}

/** 申告ステータスの部分更新。失敗した場合は null。 */
export async function updateFilingStatus(
  year: number,
  patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean },
): Promise<FilingStatus | null> {
  const data = await apiJsonOrNull<{ status: FilingStatus }>(`/api/filing-status/${year}`, {
    method: "PUT",
    body: patch,
  });
  return data?.status ?? null;
}

/* ---------- 申告入力（控除等） ---------- */

/** 対象年の申告入力をDBから取得する。未保存・失敗時は null。 */
export async function fetchFilingInputs(
  year: number,
): Promise<{ state: unknown } | null> {
  const data = await apiJsonOrNull<{ state: unknown }>(`/api/filing-inputs/${year}`);
  if (!data || data.state === null || data.state === undefined) return null;
  return { state: data.state };
}

/** 対象年の申告入力をDBへ保存する。失敗した場合は false。 */
export async function saveFilingInputs(year: number, state: unknown): Promise<boolean> {
  const resp = await apiJsonOrNull(`/api/filing-inputs/${year}`, {
    method: "PUT",
    body: { state },
  });
  return resp !== null;
}

/* ---------- 確定スナップショット ---------- */

/** 対象年の確定スナップショット一覧。失敗した場合は null。 */
export async function fetchFilingSnapshots(year: number): Promise<FilingSnapshot[] | null> {
  const data = await apiJsonOrNull<{ snapshots: FilingSnapshot[] }>(
    `/api/filing-snapshots/${year}`,
  );
  return data?.snapshots ?? null;
}

/** 確定スナップショットを1件追加する。失敗した場合は null。 */
export async function createFilingSnapshot(
  year: number,
  figures: FilingSnapshotFigures,
): Promise<FilingSnapshot | null> {
  return apiJsonOrNull<FilingSnapshot>(`/api/filing-snapshots/${year}`, {
    method: "POST",
    body: { figures },
  });
}

/* ---------- 提出の記録 ---------- */

/** 対象年の提出の記録一覧。取得できない場合は null。 */
export async function fetchFilingSubmissions(
  year: number,
): Promise<FilingSubmission[] | null> {
  const data = await apiJsonOrNull<{ submissions: FilingSubmission[] }>(
    `/api/filing-submissions/${year}`,
  );
  return data?.submissions ?? null;
}

/** 提出の記録（受付番号・提出日）を保存する。失敗した場合は null。 */
export async function saveFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
  input: { acceptance_number: string; submitted_date: string | null },
): Promise<FilingSubmission | null> {
  const data = await apiJsonOrNull<{ submission: FilingSubmission }>(
    `/api/filing-submissions/${year}/${kind}`,
    { method: "PUT", body: input },
  );
  return data?.submission ?? null;
}

/** 提出の記録を削除する（受信通知PDFの実体も消える）。 */
export async function deleteFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
): Promise<boolean> {
  const resp = await apiJsonOrNull(`/api/filing-submissions/${year}/${kind}`, {
    method: "DELETE",
  });
  return resp !== null;
}

/** 受信通知PDF（端末上のファイル）を提出の記録へ添付する。 */
export async function uploadFilingReceiptPdf(
  year: number,
  kind: FilingSubmissionKind,
  uri: string,
): Promise<FilingSubmission> {
  const bytes = await readLocalFileBytes(uri);
  const fileId = await uploadViaPresignedUrl(bytes, "application/pdf", "filing_receipt");
  const data = await apiJson<{ submission: FilingSubmission }>(
    `/api/filing-submissions/${year}/${kind}/receipt`,
    { method: "POST", body: { file_id: fileId } },
  );
  return data.submission;
}

/** 受信通知PDFの配信パス（表示時は認証付きで取得する）。 */
export function filingReceiptContentPath(
  year: number,
  kind: FilingSubmissionKind,
): string {
  return `/api/filing-submissions/${year}/${kind}/receipt/content`;
}

/** 対象年の提出の記録の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchFilingSubmissionHistory(
  year: number,
): Promise<FilingSubmissionHistoryEntry[] | null> {
  const data = await apiJsonOrNull<{ history: FilingSubmissionHistoryEntry[] }>(
    `/api/filing-submissions/${year}/history`,
  );
  return data?.history ?? null;
}

/* ---------- 納税者プロフィール ---------- */

/** 納税者プロフィール（年度別・DB保存）を取得する。取得できない場合は null。 */
export async function fetchTaxpayerProfile(
  year: number,
): Promise<TaxpayerProfileResult | null> {
  return apiJsonOrNull<TaxpayerProfileResult>(`/api/taxpayer/${year}`);
}

/** 納税者プロフィールを対象年としてDBへ保存する。失敗した場合は false。 */
export async function saveTaxpayerProfile(
  year: number,
  taxpayer: XtxTaxpayerInput,
): Promise<boolean> {
  const resp = await apiJsonOrNull(`/api/taxpayer/${year}`, {
    method: "PUT",
    body: taxpayer,
  });
  return resp !== null;
}

/* ---------- 開業入力 ---------- */

/** 開業の専用入力を取得する。失敗時は null。 */
export async function fetchBusinessStartInputs(): Promise<BusinessStartInputsResponse | null> {
  return apiJsonOrNull<BusinessStartInputsResponse>("/api/business-start-inputs");
}

/** 開業の専用入力をDBへ保存する。失敗した場合は false。 */
export async function saveBusinessStartInputs(state: BusinessStartInputs): Promise<boolean> {
  const resp = await apiJsonOrNull("/api/business-start-inputs", {
    method: "PUT",
    body: { state },
  });
  return resp !== null;
}

/* ---------- e-Tax 出力 ---------- */

/** e-Tax 申告等データ（XTX）を生成する。 */
export async function exportXtxFile(request: ExportXtxRequest): Promise<ExportXtxResponse> {
  return apiJson<ExportXtxResponse>("/api/etax/export-xtx", {
    method: "POST",
    body: request,
  });
}

/** 申告書の紙イメージ PDF を生成する。リクエスト形式は XTX 出力と共通。 */
export async function exportReturnPdfFile(
  request: ExportXtxRequest,
): Promise<ExportReturnPdfResponse> {
  return apiJson<ExportReturnPdfResponse>("/api/etax/export-return-pdf", {
    method: "POST",
    body: request,
  });
}

/** 納税地の異動申出書（印刷用 PDF）を生成する。 */
export async function exportDomicilePdfFile(request: {
  year: number;
  submission_date: string;
  taxpayer: XtxTaxpayerInput;
}): Promise<ExportReturnPdfResponse> {
  return apiJson<ExportReturnPdfResponse>("/api/etax/export-domicile-pdf", {
    method: "POST",
    body: request,
  });
}

/** 個人事業の開業・廃業等届出書（印刷用 PDF）を生成する。 */
export async function exportOpeningNoticePdfFile(
  request: ExportBusinessStartPdfRequest,
): Promise<ExportBusinessStartPdfResponse> {
  return apiJson<ExportBusinessStartPdfResponse>("/api/etax/export-opening-notice-pdf", {
    method: "POST",
    body: request,
  });
}

/** 所得税の青色申告承認申請書（印刷用 PDF）を生成する。 */
export async function exportBlueReturnPdfFile(
  request: ExportBusinessStartPdfRequest,
): Promise<ExportBusinessStartPdfResponse> {
  return apiJson<ExportBusinessStartPdfResponse>("/api/etax/export-blue-return-pdf", {
    method: "POST",
    body: request,
  });
}

/** 消費税申告書（本則）のXTXを生成する。 */
export async function exportConsumptionXtxFile(
  request: ExportConsumptionXtxRequest,
): Promise<ExportConsumptionXtxResponse> {
  return apiJson<ExportConsumptionXtxResponse>("/api/etax/export-consumption-xtx", {
    method: "POST",
    body: request,
  });
}
