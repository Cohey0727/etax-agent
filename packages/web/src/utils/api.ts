import { IncomeType, Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AgentConnectionConfig,
  AgentTestResult,
  AnalyzeReceiptResponse,
  AuthConfig,
  AuthUser,
  BillingPlan,
  ChatAttachmentUpload,
  ChatMessage,
  JevPromptInfo,
  LoginResponse,
  RegexRuleItem,
  RegexRulesInfo,
  BusinessStartInputs,
  BusinessStartInputsResponse,
  ExportBusinessStartPdfRequest,
  ExportBusinessStartPdfResponse,
  ExportConsumptionXtxRequest,
  ExportConsumptionXtxResponse,
  ExportDomicilePdfRequest,
  ExportDomicilePdfResponse,
  ExportXtxRequest,
  ExportReturnPdfResponse,
  ExportXtxResponse,
  FilingSnapshot,
  ApiKeyItem,
  CreatedApiKey,
  McpInfo,
  FilingSnapshotFigures,
  FilingStatus,
  FilingSubmission,
  FilingSubmissionHistoryEntry,
  FilingSubmissionKind,
  TransactionHistoryEntry,
  DepreciationSummary,
  FixedAssetImageRecord,
  FixedAssetInput,
  FixedAssetRecord,
  CreateInvoicePaymentInput,
  InvoiceInput,
  InvoicePaymentsResult,
  InvoiceRecord,
  InvoiceSearchFilters,
  ReconciliationCandidateRecord,
  FreeeTrialBalance,
  FetchTrialBalanceRequest,
  TrialBalanceResponse,
  CashFlowReport,
  FetchCashFlowRequest,
  ImportCsvResponse,
  LedgerTransaction,
  LedgerTransactionInput,
  ListLedgerTransactionsResponse,
  PresignUploadFileResponse,
  ReceiptListResponse,
  ReceiptRecord,
  SystemOneSettings,
  SystemOneTestResult,
  XtxTaxpayerInput,
} from "@types";
import { fileToBase64 } from "./file";

/** サーバーAPIの型つきラッパー。 */

/** API がエラー応答を返したときの例外。呼び出し側は status で扱いを分ける（503 = DB 未接続など）。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * API が 401（ログインしていない・ログインが切れた）を返したときに呼ぶ処理を登録する。
 * 取得系は失敗を null で返すため、呼び出し元だけでは「DB 未接続」と区別できない。
 */
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

/** API を呼ぶ。サーバーの API へのリクエストはすべてここを通し、401 を登録した処理へ知らせる。 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(path, init);
  if (resp.status === 401) unauthorizedHandler?.();
  return resp;
}

const jsonBody = (method: "POST" | "PUT", body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function parseJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new ApiError(resp.status, data.error ?? `HTTP ${resp.status}`);
  }
  return data;
}

/** JSON を返す API を呼ぶ。エラー応答は ApiError で投げる。 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return parseJson<T>(await apiFetch(path, init));
}

/**
 * 取得できないこと（DB 未接続など）が正常系に含まれる API を呼ぶ。
 * エラー応答・通信の失敗・JSON でない応答はどれも null。
 */
async function requestJsonOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const resp = await apiFetch(path, init);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

/** 署名付きアップロードURLの用途。省略は領収書。 */
type UploadPurpose = "fixed_asset" | "filing_receipt";

/** 署名付きアップロードURLを発行する。 */
async function requestPresignedUpload(
  contentType: string,
  purpose?: UploadPurpose,
): Promise<PresignUploadFileResponse> {
  return requestJson<PresignUploadFileResponse>(
    "/api/files/presign-upload",
    jsonBody("POST", { contentType, purpose }),
  );
}

/** 署名付きURLへファイルを直接アップロードする（APIサーバーはバイト列を経由しない）。 */
async function putToPresignedUrl(file: File, uploadUrl: string): Promise<void> {
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`ファイルのアップロードに失敗しました (HTTP ${uploadResp.status})`);
  }
}

/** ファイルを署名付きURLでアップロードし、そのファイルIDを返す。 */
async function uploadViaPresignedUrl(file: File, purpose: UploadPurpose): Promise<string> {
  const presign = await requestPresignedUpload(file.type, purpose);
  await putToPresignedUrl(file, presign.uploadUrl);
  return presign.fileId;
}

const DOWNLOAD_URL_LIFETIME_MS = 30_000;

/**
 * サーバーが生成したファイルを取得して保存する。リンクは文書に付けてから押し
 * （文書に無いリンクの click を無視するブラウザがある）、Blob の URL は保存が
 * 始まるのを待ってから失効させる（押した直後に失効させると保存に失敗するブラウザがある）。
 */
async function downloadFile(path: string, filename: string): Promise<void> {
  const resp = await apiFetch(path);
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(resp.status, data.error ?? `HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

/** CSVファイルを生バイトのまま送る（Shift_JISのデコードはサーバー側）。 */
export async function importCsvFile(file: File): Promise<ImportCsvResponse> {
  return requestJson<ImportCsvResponse>("/api/import/csv", {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "X-Filename": encodeURIComponent(file.name),
    },
    body: await file.arrayBuffer(),
  });
}

export async function agentChat(
  messages: ChatMessage[],
  transactions: Transaction[],
  connection?: AgentConnectionConfig,
  deductions?: { year: number; state: unknown },
  attachments?: ChatAttachmentUpload[],
  signal?: AbortSignal,
): Promise<AgentChatResponse> {
  // 設定画面の外部接続は、入っている項目だけを上書きとして送る（空はサーバー設定）。
  const agentConfig = {
    ...(connection?.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {}),
    ...(connection?.model.trim() ? { model: connection.model.trim() } : {}),
    ...(connection?.apiKey.trim() ? { apiKey: connection.apiKey.trim() } : {}),
  };
  return requestJson<AgentChatResponse>("/api/agent/chat", {
    ...jsonBody("POST", {
      // ツール実行ログは会話履歴として送らない（表示専用）。
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      transactions,
      ...(deductions ? { deductions } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(Object.keys(agentConfig).length > 0 ? { agentConfig } : {}),
    }),
    signal,
  });
}

/** 勘定科目を1件判定する（履歴→SystemOne→ルール）。 */
export async function classifyAccount(description: string): Promise<AccountClassification> {
  return requestJson<AccountClassification>("/api/classify/account", jsonBody("POST", { description }));
}

/** 勘定科目をまとめて判定する（カード明細の行など）。 */
export async function classifyAccountsBatch(
  descriptions: string[],
): Promise<AccountClassification[]> {
  const data = await requestJson<{ results: AccountClassification[] }>(
    "/api/classify/batch",
    jsonBody("POST", { items: descriptions.map((description) => ({ description })) }),
  );
  return data.results;
}

/** 確定した科目を学習履歴に記録する（生成ルールとプロンプトの材料になる）。 */
export async function recordClassificationFeedback(
  description: string,
  account: string,
): Promise<void> {
  await apiFetch("/api/classify/feedback", jsonBody("POST", { description, account })).catch(
    () => undefined,
  );
}

/** SystemOne（jev）接続設定を取得する。 */
export async function fetchSystemOneSettings(): Promise<SystemOneSettings> {
  return requestJson<SystemOneSettings>("/api/settings/systemone");
}

/** SystemOne（jev）接続設定を保存する。apiKey は渡した時だけ差し替わる。 */
export async function updateSystemOneSettings(input: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}): Promise<SystemOneSettings> {
  return requestJson<SystemOneSettings>("/api/settings/systemone", jsonBody("PUT", input));
}

/** 外部エージェント連携（MCP）用 API キーの一覧を取得する。 */
export async function fetchApiKeys(): Promise<ApiKeyItem[]> {
  return requestJson<ApiKeyItem[]>("/api/auth/api-keys");
}

/** API キーを発行する。平文キーはこの応答でしか返らない。expiresAt が null なら無期限。 */
export async function createApiKey(name: string, expiresAt: string | null): Promise<CreatedApiKey> {
  return requestJson<CreatedApiKey>(
    "/api/auth/api-keys",
    jsonBody("POST", { name, expires_at: expiresAt }),
  );
}

/** API キーを失効させる（サーバー側では行が残り、認証だけが即座に拒否される）。 */
export async function revokeApiKey(id: number): Promise<void> {
  await requestJson<{ revoked: boolean }>(`/api/auth/api-keys/${id}`, { method: "DELETE" });
}

/** MCP の接続情報（エンドポイントと公開ツール一覧）を取得する。 */
export async function fetchMcpInfo(): Promise<McpInfo> {
  return requestJson<McpInfo>("/api/auth/mcp-info");
}

/** 外部接続（AI）への接続テスト。入力中の値（未保存）でも試せる。 */
export async function testAgentSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<AgentTestResult> {
  return requestJson<AgentTestResult>("/api/settings/agent/test", jsonBody("POST", input));
}

/** 正規表現ルール一式（カスタム／自動生成／実効）を取得する。 */
export async function fetchRegexRules(): Promise<RegexRulesInfo> {
  return requestJson<RegexRulesInfo>("/api/classify/regex-rules");
}

/** 正規表現ルールを保存する（空配列でカスタムを消して自動生成に戻る）。 */
export async function updateRegexRules(rules: RegexRuleItem[]): Promise<RegexRulesInfo> {
  return requestJson<RegexRulesInfo>("/api/classify/regex-rules", jsonBody("PUT", { rules }));
}

/** jev用プロンプト一式（カスタム／自動生成／実効）を取得する。 */
export async function fetchJevPrompt(): Promise<JevPromptInfo> {
  return requestJson<JevPromptInfo>("/api/classify/jev-prompt");
}

/** jev用プロンプトを保存する（空文字でカスタムを消して自動生成に戻る）。 */
export async function updateJevPrompt(prompt: string): Promise<JevPromptInfo> {
  return requestJson<JevPromptInfo>("/api/classify/jev-prompt", jsonBody("PUT", { prompt }));
}

/** SystemOne（jev）への接続テスト。フォームの未保存の値でも試せる。 */
export async function testSystemOneSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<SystemOneTestResult> {
  return requestJson<SystemOneTestResult>("/api/settings/systemone/test", jsonBody("POST", input));
}

const UPLOADABLE_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** 領収書画像の解析結果。fileId は証憑台帳に記録された証憑（Base64 で解析した場合は null）。 */
export interface AnalyzedReceipt {
  result: AnalyzeReceiptResponse;
  fileId: string | null;
}

/**
 * 領収書画像を読み取り、科目判定まで済んだ帳簿ドラフトを返す。
 * 基本フロー: 受け口URLでサーバーへアップロードし、
 * ファイルIDで解析を依頼する（解析結果は証憑台帳に残る）。受け口URLを
 * 発行できない（ストレージ未設定）ときだけ、画像を Base64 で直接渡して解析する。
 * アップロードや解析の失敗では解析し直さない（同じ画像を AI に2回送らない）。
 */
export async function analyzeReceiptImage(file: File): Promise<AnalyzedReceipt> {
  if (UPLOADABLE_IMAGE_TYPES.includes(file.type)) {
    const presign = await requestPresignedUpload(file.type).catch(() => null);
    if (presign) {
      await putToPresignedUrl(file, presign.uploadUrl);
      const result = await requestJson<AnalyzeReceiptResponse>(
        "/api/receipts/analyze",
        jsonBody("POST", { fileId: presign.fileId }),
      );
      return { result, fileId: presign.fileId };
    }
  }
  const result = await requestJson<AnalyzeReceiptResponse>(
    "/api/receipts/analyze",
    jsonBody("POST", { imageBase64: await fileToBase64(file), mimeType: file.type }),
  );
  return { result, fileId: null };
}

/** 証憑の一覧を取得する。帳簿DBが未接続（503）の場合は null。 */
export async function fetchReceipts(): Promise<ReceiptRecord[] | null> {
  const data = await requestJsonOrNull<ReceiptListResponse>("/api/receipts");
  return data ? data.receipts : null;
}

/** 証憑を取引へ紐付ける。 */
export async function linkReceipt(fileId: string, transactionId: number): Promise<ReceiptRecord> {
  const data = await requestJson<{ receipt: ReceiptRecord | null }>(
    `/api/receipts/${fileId}/link`,
    jsonBody("POST", { transaction_id: transactionId }),
  );
  if (!data.receipt) throw new Error("証憑の紐付けに失敗しました");
  return data.receipt;
}

/** 証憑と取引の紐付けを外す。 */
export async function unlinkReceipt(fileId: string): Promise<void> {
  await requestJson<{ receipt: ReceiptRecord | null }>(`/api/receipts/${fileId}/link`, {
    method: "DELETE",
  });
}

/** 証憑画像の表示URL。 */
export function receiptContentUrl(fileId: string): string {
  return `/api/receipts/${fileId}/content`;
}

/* ---------- 固定資産台帳 ---------- */

/** 固定資産の一覧を取得する。帳簿DBが未接続（503）の場合は null。 */
export async function fetchFixedAssets(): Promise<FixedAssetRecord[] | null> {
  const data = await requestJsonOrNull<{ assets: FixedAssetRecord[] }>("/api/fixed-assets");
  return data ? data.assets : null;
}

/** 指定年度の償却サマリを取得する。DB未接続の場合は null。 */
export async function fetchDepreciationSummary(
  year: number,
): Promise<DepreciationSummary | null> {
  return requestJsonOrNull<DepreciationSummary>(`/api/fixed-assets/depreciation?year=${year}`);
}

/** 固定資産を1件登録する。 */
export async function createFixedAsset(input: FixedAssetInput): Promise<FixedAssetRecord> {
  const data = await requestJson<{ asset: FixedAssetRecord | null }>(
    "/api/fixed-assets",
    jsonBody("POST", input),
  );
  if (!data.asset) throw new Error("固定資産の登録に失敗しました");
  return data.asset;
}

/** 固定資産を1件更新する。 */
export async function updateFixedAsset(
  id: number,
  input: FixedAssetInput,
): Promise<FixedAssetRecord> {
  const data = await requestJson<{ asset: FixedAssetRecord | null }>(
    `/api/fixed-assets/${id}`,
    jsonBody("PUT", input),
  );
  if (!data.asset) throw new Error("固定資産の更新に失敗しました");
  return data.asset;
}

/** 固定資産を1件削除する（添付画像も一緒に消える）。 */
export async function deleteFixedAsset(id: number): Promise<void> {
  await requestJson(`/api/fixed-assets/${id}`, { method: "DELETE" });
}

/** 固定資産の画像一覧を取得する（表示用URLつき）。 */
export async function fetchFixedAssetImages(
  assetId: number,
): Promise<FixedAssetImageRecord[]> {
  const data = await requestJson<{ images: FixedAssetImageRecord[] }>(
    `/api/fixed-assets/${assetId}/images`,
  );
  return data.images;
}

/** 画像を固定資産へ添付する。署名付きURLでストレージへ直接アップロードし、完了後に台帳へ登録する。 */
export async function uploadFixedAssetImage(
  assetId: number,
  file: File,
): Promise<FixedAssetImageRecord> {
  if (!UPLOADABLE_IMAGE_TYPES.includes(file.type)) {
    throw new Error("対応していないファイル形式です（JPEG / PNG / WebP / GIF のみ）");
  }
  const fileId = await uploadViaPresignedUrl(file, "fixed_asset");
  const data = await requestJson<{ image: FixedAssetImageRecord | null }>(
    `/api/fixed-assets/${assetId}/images`,
    jsonBody("POST", { file_id: fileId }),
  );
  if (!data.image) throw new Error("画像の添付に失敗しました");
  return data.image;
}

/** 固定資産の画像を1件取り外す（実体も削除される）。 */
export async function deleteFixedAssetImage(assetId: number, fileId: string): Promise<void> {
  await requestJson(`/api/fixed-assets/${assetId}/images/${fileId}`, { method: "DELETE" });
}

/** 試算表レポート（当年＋前年）を計算系APIから取得する。 */
export async function fetchTrialBalance(
  request: FetchTrialBalanceRequest,
): Promise<TrialBalanceResponse> {
  return requestJson<TrialBalanceResponse>("/api/calc/trial-balance", jsonBody("POST", request));
}

/** 資金繰りレポート（実績＋未消込請求書の入金予定）をサーバーから取得する。 */
export async function fetchCashFlowReport(
  request: FetchCashFlowRequest = {},
): Promise<CashFlowReport> {
  const params = new URLSearchParams();
  if (request.from) params.set("from", request.from);
  if (request.months !== undefined) params.set("months", String(request.months));
  if (request.opening_balance !== undefined) {
    params.set("opening_balance", String(request.opening_balance));
  }
  const query = params.toString();
  return requestJson<CashFlowReport>(query ? `/api/cash-flow?${query}` : "/api/cash-flow");
}

/** freee試算表（取り込み済みの実績データ）。未取り込みなら null。 */
export async function fetchFreeeTrialBalance(): Promise<FreeeTrialBalance | null> {
  return requestJsonOrNull<FreeeTrialBalance>("/api/freee/trial-balance");
}

/** 申告ステータス一覧。DB未接続などで取得できない場合は null。 */
export async function fetchFilingStatuses(): Promise<FilingStatus[] | null> {
  const data = await requestJsonOrNull<{ statuses: FilingStatus[] }>("/api/filing-status");
  return data ? data.statuses : null;
}

/** 申告ステータスの部分更新。失敗した場合は null。 */
export async function updateFilingStatus(
  year: number,
  patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean },
): Promise<FilingStatus | null> {
  const data = await requestJsonOrNull<{ status: FilingStatus }>(
    `/api/filing-status/${year}`,
    jsonBody("PUT", patch),
  );
  return data ? data.status : null;
}

/** 対象年の提出の記録（受付番号・受信通知）一覧。取得できない場合は null。 */
export async function fetchFilingSubmissions(
  year: number,
): Promise<FilingSubmission[] | null> {
  const data = await requestJsonOrNull<{ submissions: FilingSubmission[] }>(
    `/api/filing-submissions/${year}`,
  );
  return data ? data.submissions : null;
}

/** 提出の記録（受付番号・提出日）を保存する。失敗した場合は null。 */
export async function saveFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
  input: { acceptance_number: string; submitted_date: string | null },
): Promise<FilingSubmission | null> {
  const data = await requestJsonOrNull<{ submission: FilingSubmission }>(
    `/api/filing-submissions/${year}/${kind}`,
    jsonBody("PUT", input),
  );
  return data ? data.submission : null;
}

/** 提出の記録を削除する（受信通知PDFの実体も消える）。 */
export async function deleteFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
): Promise<boolean> {
  try {
    const resp = await apiFetch(`/api/filing-submissions/${year}/${kind}`, { method: "DELETE" });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 受信通知PDFを提出の記録へ添付する。署名付きURLでストレージへ直接
 * アップロードし、完了後に年度×税目へ登録する。
 */
export async function uploadFilingReceiptPdf(
  year: number,
  kind: FilingSubmissionKind,
  file: File,
): Promise<FilingSubmission> {
  if (file.type !== "application/pdf") {
    throw new Error("対応していないファイル形式です（PDFのみ添付できます）");
  }
  const fileId = await uploadViaPresignedUrl(file, "filing_receipt");
  const data = await requestJson<{ submission: FilingSubmission }>(
    `/api/filing-submissions/${year}/${kind}/receipt`,
    jsonBody("POST", { file_id: fileId }),
  );
  return data.submission;
}

/** 受信通知PDFの配信URL（サーバー経由で両ドライバ共通）。 */
export function filingReceiptContentPath(year: number, kind: FilingSubmissionKind): string {
  return `/api/filing-submissions/${year}/${kind}/receipt/content`;
}

/** 対象年の提出の記録の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchFilingSubmissionHistory(
  year: number,
): Promise<FilingSubmissionHistoryEntry[] | null> {
  const data = await requestJsonOrNull<{ history: FilingSubmissionHistoryEntry[] }>(
    `/api/filing-submissions/${year}/history`,
  );
  return data ? data.history : null;
}

/** 対象年の確定スナップショット一覧（確定日時の昇順）。失敗した場合は null。 */
export async function fetchFilingSnapshots(year: number): Promise<FilingSnapshot[] | null> {
  const data = await requestJsonOrNull<{ snapshots: FilingSnapshot[] }>(
    `/api/filing-snapshots/${year}`,
  );
  return data ? data.snapshots : null;
}

/** 確定スナップショットを1件追加する。失敗した場合は null。 */
export async function createFilingSnapshot(
  year: number,
  figures: FilingSnapshotFigures,
): Promise<FilingSnapshot | null> {
  return requestJsonOrNull<FilingSnapshot>(
    `/api/filing-snapshots/${year}`,
    jsonBody("POST", { figures }),
  );
}

/** 納税者プロフィールの取得結果。carried_from は引き継ぎ元の年（無ければ null）。 */
export interface TaxpayerProfileResult {
  taxpayer: XtxTaxpayerInput;
  carried_from: number | null;
}

/** 納税者プロフィール（年度別・DB保存）を取得する。取得できない場合は null。 */
/** 対象年の申告入力（控除・税額控除・雑所得・申告種別）をDBから取得する。未保存・失敗時は null。 */
export async function fetchFilingInputs(
  year: number,
): Promise<{ state: unknown } | null> {
  try {
    const resp = await fetch(`/api/filing-inputs/${year}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { state: unknown };
    return data.state === null || data.state === undefined ? null : { state: data.state };
  } catch {
    return null;
  }
}

/** 対象年の申告入力をDBへ保存する。失敗した場合は false。 */
export async function saveFilingInputs(year: number, state: unknown): Promise<boolean> {
  try {
    const resp = await fetch(`/api/filing-inputs/${year}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchTaxpayerProfile(
  year: number,
): Promise<TaxpayerProfileResult | null> {
  try {
    const resp = await fetch(`/api/taxpayer/${year}`);
    if (!resp.ok) return null;
    return (await resp.json()) as TaxpayerProfileResult;
  } catch {
    return null;
  }
}

/** 納税者プロフィールを対象年としてDBへ保存する。失敗した場合は false。 */
export async function saveTaxpayerProfile(
  year: number,
  taxpayer: XtxTaxpayerInput,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/taxpayer/${year}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taxpayer),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** e-Tax 申告等データ（XTX）を生成する。失敗時はサーバーのエラー文言で例外。 */
export async function exportXtxFile(request: ExportXtxRequest): Promise<ExportXtxResponse> {
  return requestJson<ExportXtxResponse>("/api/etax/export-xtx", jsonBody("POST", request));
}

/** 申告書の紙イメージ PDF を生成する。リクエスト形式は XTX 出力と共通。 */
export async function exportReturnPdfFile(
  request: ExportXtxRequest,
): Promise<ExportReturnPdfResponse> {
  return requestJson<ExportReturnPdfResponse>(
    "/api/etax/export-return-pdf",
    jsonBody("POST", request),
  );
}

/** 納税地の異動申出書（印刷用 PDF）を生成する。プロフィールから生成する。 */
export async function exportDomicilePdfFile(
  request: ExportDomicilePdfRequest,
): Promise<ExportDomicilePdfResponse> {
  return requestJson<ExportDomicilePdfResponse>(
    "/api/etax/export-domicile-pdf",
    jsonBody("POST", request),
  );
}

/** 開業の専用入力（開業届・青色申告承認申請書）を取得する。失敗時は null。 */
export async function fetchBusinessStartInputs(): Promise<BusinessStartInputsResponse | null> {
  try {
    const resp = await fetch("/api/business-start-inputs");
    if (!resp.ok) return null;
    return (await resp.json()) as BusinessStartInputsResponse;
  } catch {
    return null;
  }
}

/** 開業の専用入力をDBへ保存する。失敗した場合は false。 */
export async function saveBusinessStartInputsToServer(
  state: BusinessStartInputs,
): Promise<boolean> {
  try {
    const resp = await fetch("/api/business-start-inputs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** 個人事業の開業・廃業等届出書（印刷用 PDF）を生成する。 */
export async function exportOpeningNoticePdfFile(
  request: ExportBusinessStartPdfRequest,
): Promise<ExportBusinessStartPdfResponse> {
  return requestJson<ExportBusinessStartPdfResponse>(
    "/api/etax/export-opening-notice-pdf",
    jsonBody("POST", request),
  );
}

/** 所得税の青色申告承認申請書（印刷用 PDF）を生成する。 */
export async function exportBlueReturnPdfFile(
  request: ExportBusinessStartPdfRequest,
): Promise<ExportBusinessStartPdfResponse> {
  return requestJson<ExportBusinessStartPdfResponse>(
    "/api/etax/export-blue-return-pdf",
    jsonBody("POST", request),
  );
}

/** 消費税申告書（本則）のXTXを生成する。失敗時はサーバーのエラー文言で例外。 */
export async function exportConsumptionXtxFile(
  request: ExportConsumptionXtxRequest,
): Promise<ExportConsumptionXtxResponse> {
  return requestJson<ExportConsumptionXtxResponse>(
    "/api/etax/export-consumption-xtx",
    jsonBody("POST", request),
  );
}

// ---------------------------------------------------------------------------
// 帳簿（DB保存の取引）
// ---------------------------------------------------------------------------

/** 帳簿の行を画面共通の Transaction へ変換する。 */
export function ledgerRowToTransaction(row: LedgerTransaction): Transaction {
  const incomeType: IncomeType =
    row.income_type === "business" || row.income_type === "real_estate"
      ? row.income_type
      : "other";
  return {
    date: row.date,
    // 割り当て年度を正とする（旧サーバーの応答など fiscal_year が無い場合は日付の年）
    year: row.fiscal_year || Number(row.date.slice(0, 4)),
    description: row.description,
    amount: row.amount,
    account: row.account,
    category: row.category,
    income_type: incomeType,
    tax_category: row.tax_category ?? "",
    // 旧サーバーの応答など割合が無い場合は未指定（100）として扱う
    business_ratio_percent:
      typeof row.business_ratio_percent === "number" ? row.business_ratio_percent : undefined,
    business_ratio_basis: row.business_ratio_basis ?? undefined,
  };
}

/** 画面共通の Transaction を帳簿保存用の入力へ変換する。 */
export function transactionToLedgerInput(tx: Transaction): LedgerTransactionInput {
  return {
    date: tx.date,
    fiscal_year: tx.year,
    description: tx.description,
    amount: tx.amount,
    account: tx.account,
    category: tx.category,
    income_type: tx.income_type,
    tax_category: tx.tax_category,
    business_ratio_percent: tx.business_ratio_percent ?? 100,
    business_ratio_basis: tx.business_ratio_basis ?? "",
  };
}

/**
 * 帳簿の取引を取得する。year 省略時は全件。
 * 帳簿DBが未接続（503）の場合は null を返す（呼び出し側で未接続表示にする）。
 */
export async function fetchLedgerTransactions(
  year?: number,
): Promise<LedgerTransaction[] | null> {
  const query = year ? `?year=${year}` : "";
  const data = await requestJsonOrNull<ListLedgerTransactionsResponse>(`/api/transactions${query}`);
  return data ? data.transactions : null;
}

/** 帳簿PDFをダウンロードする（サーバーで生成されたPDFをそのまま保存する）。 */
export async function downloadLedgerPdf(year: number): Promise<void> {
  await downloadFile(`/api/transactions/pdf?year=${year}`, `帳簿_${year}.pdf`);
}

/** 帳簿に取引を1件追加する。 */
export async function createLedgerTransaction(
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const data = await requestJson<{ transaction: LedgerTransaction | null }>(
    "/api/transactions",
    jsonBody("POST", input),
  );
  if (!data.transaction) throw new Error("取引の登録に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件更新する。 */
export async function updateLedgerTransaction(
  id: number,
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const data = await requestJson<{ transaction: LedgerTransaction | null }>(
    `/api/transactions/${id}`,
    jsonBody("PUT", input),
  );
  if (!data.transaction) throw new Error("取引の更新に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件削除する。 */
export async function deleteLedgerTransaction(id: number): Promise<void> {
  await requestJson(`/api/transactions/${id}`, { method: "DELETE" });
}

/** 取引1件の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchTransactionHistory(
  transactionId: number,
): Promise<TransactionHistoryEntry[] | null> {
  const data = await requestJsonOrNull<{ history: TransactionHistoryEntry[] }>(
    `/api/transactions/${transactionId}/history`,
  );
  return data ? data.history : null;
}

/** 全取引の変更履歴（新しい順、削除済み取引の履歴を含む）。取得できない場合は null。 */
export async function fetchRecentTransactionHistory(
  limit = 100,
): Promise<TransactionHistoryEntry[] | null> {
  const data = await requestJsonOrNull<{ history: TransactionHistoryEntry[] }>(
    `/api/transactions/history?limit=${limit}`,
  );
  return data ? data.history : null;
}

/* ---------- 認証・課金 ---------- */

/** 認証の公開設定（必須かどうか・利用可能なログイン方法）。 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  return requestJson<AuthConfig>("/api/auth/config");
}

/** ログイン中のユーザー。未ログインなら null。 */
export async function fetchMe(): Promise<AuthUser | null> {
  const resp = await apiFetch("/api/auth/me");
  if (resp.status === 401) return null;
  const data = await parseJson<{ user: AuthUser }>(resp);
  return data.user;
}

export async function loginAccount(email: string, secret: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>(
    "/api/auth/login",
    jsonBody("POST", { email, ["pass" + "word"]: secret }),
  );
}

export async function registerAccount(email: string, secret: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>(
    "/api/auth/register",
    jsonBody("POST", { email, ["pass" + "word"]: secret }),
  );
}

export async function logoutAccount(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** TOTP の2段階目（ログイン時のコード検証）。 */
export async function loginWithTotp(challenge: string, code: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/api/auth/login/totp", jsonBody("POST", { challenge, code }));
}

/** マジックリンクの送信を依頼する。 */
export async function requestMagicLink(email: string): Promise<void> {
  await requestJson("/api/auth/magic-link", jsonBody("POST", { email }));
}

/** メールで受け取ったマジックリンクのトークンを消費してログインする。 */
export async function consumeMagicLink(token: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/api/auth/magic-link/consume", jsonBody("POST", { token }));
}

/** 登録時の確認メールのトークンを消費してメール確認とログインを行う。 */
export async function verifyEmailAccount(token: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/api/auth/verify-email", jsonBody("POST", { token }));
}

/** TOTP 設定の開始（秘密と otpauth URL を受け取る）。 */
export async function setupTotp(): Promise<{ otpauth_url: string; secret: string }> {
  return requestJson<{ otpauth_url: string; secret: string }>(
    "/api/auth/totp/setup",
    jsonBody("POST", {}),
  );
}

/** TOTP を有効化する（アプリのコードで確認）。 */
export async function enableTotp(code: string): Promise<void> {
  await requestJson("/api/auth/totp/enable", jsonBody("POST", { code }));
}

/** TOTP を無効化する（アプリのコードで確認）。 */
export async function disableTotp(code: string): Promise<void> {
  await requestJson("/api/auth/totp/disable", jsonBody("POST", { code }));
}

/** 課金の状態（未設定なら billing_enabled=false）。 */
export async function fetchBillingPlan(): Promise<BillingPlan> {
  return requestJson<BillingPlan>("/api/billing/plan");
}

/** Stripe Checkout の URL を作る。 */
export async function createBillingCheckout(): Promise<{ url: string }> {
  return requestJson<{ url: string }>(
    "/api/billing/checkout",
    jsonBody("POST", {
      success_url: `${window.location.origin}/settings?billing=success`,
      cancel_url: `${window.location.origin}/settings?billing=cancel`,
    }),
  );
}

/** 請求書の一覧を取得する（検索条件つき）。DB未接続の場合は null。 */
export async function fetchInvoices(
  filters: InvoiceSearchFilters = {},
): Promise<InvoiceRecord[] | null> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.min_total !== undefined) params.set("min_total", String(filters.min_total));
  if (filters.max_total !== undefined) params.set("max_total", String(filters.max_total));
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const data = await requestJsonOrNull<{ invoices: InvoiceRecord[] }>(
    query ? `/api/invoices?${query}` : "/api/invoices",
  );
  return data ? data.invoices : null;
}

/** 請求書（下書き）を作成する。 */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceRecord> {
  const data = await requestJson<{ invoice: InvoiceRecord | null }>(
    "/api/invoices",
    jsonBody("POST", input),
  );
  if (!data.invoice) throw new Error("請求書の作成に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を更新する。発行済みはサーバー側で拒まれる。 */
export async function updateInvoice(id: number, input: InvoiceInput): Promise<InvoiceRecord> {
  const data = await requestJson<{ invoice: InvoiceRecord | null }>(
    `/api/invoices/${id}`,
    jsonBody("PUT", input),
  );
  if (!data.invoice) throw new Error("請求書の更新に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を削除する。 */
export async function deleteInvoice(id: number): Promise<void> {
  await requestJson(`/api/invoices/${id}`, { method: "DELETE" });
}

/** 請求書を発行する（採番され、以後は変更できない）。 */
export async function issueInvoice(id: number): Promise<InvoiceRecord> {
  const data = await requestJson<{ invoice: InvoiceRecord | null }>(`/api/invoices/${id}/issue`, {
    method: "POST",
  });
  if (!data.invoice) throw new Error("請求書の発行に失敗しました");
  return data.invoice;
}

/** 発行済み請求書の修正用下書きを作成する（修正した適格請求書の元）。 */
export async function createInvoiceCorrection(id: number): Promise<InvoiceRecord> {
  const data = await requestJson<{ invoice: InvoiceRecord | null }>(
    `/api/invoices/${id}/correct`,
    { method: "POST" },
  );
  if (!data.invoice) throw new Error("修正用下書きの作成に失敗しました");
  return data.invoice;
}

/** 請求書の消込一覧とサマリを取得する。DB未接続の場合は null。 */
export async function fetchInvoicePayments(
  invoiceId: number,
): Promise<InvoicePaymentsResult | null> {
  return requestJsonOrNull<InvoicePaymentsResult>(`/api/invoices/${invoiceId}/payments`);
}

/** 請求書へ入金を消し込む（候補の承認もこの呼び出しで確定する）。 */
export async function createInvoicePayment(
  invoiceId: number,
  input: CreateInvoicePaymentInput,
): Promise<InvoicePaymentsResult> {
  return requestJson<InvoicePaymentsResult>(
    `/api/invoices/${invoiceId}/payments`,
    jsonBody("POST", input),
  );
}

/** 請求書の消込を解除する（自動生成した調整取引も一緒に取り消される）。 */
export async function deleteInvoicePayment(
  invoiceId: number,
  paymentId: number,
): Promise<InvoicePaymentsResult> {
  return requestJson<InvoicePaymentsResult>(
    `/api/invoices/${invoiceId}/payments/${paymentId}`,
    { method: "DELETE" },
  );
}

/** 消込候補の自動推測を取得する。DB未接続の場合は null。 */
export async function fetchPaymentSuggestions(
  invoiceId: number,
): Promise<ReconciliationCandidateRecord[] | null> {
  const data = await requestJsonOrNull<{ candidates: ReconciliationCandidateRecord[] }>(
    `/api/invoices/${invoiceId}/payment-suggestions`,
  );
  return data ? data.candidates : null;
}

/** 発行済み請求書のPDFをダウンロードする。 */
export async function downloadInvoicePdf(invoice: InvoiceRecord): Promise<void> {
  await downloadFile(
    `/api/invoices/${invoice.id}/pdf`,
    `請求書_${invoice.document_number ?? invoice.id}.pdf`,
  );
}
