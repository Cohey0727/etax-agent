import { IncomeType, Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AgentConnectionConfig,
  AgentTestResult,
  AnalyzeReceiptResponse,
  ChatAttachmentUpload,
  ChatMessage,
  JevPromptInfo,
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

/** サーバーAPIの型つきラッパー。 */

/** API がエラー応答を返したときの例外。呼び出し側は status で扱いを分ける（503 = DB 未接続など）。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new ApiError(resp.status, data.error ?? `HTTP ${resp.status}`);
  }
  return data;
}

/** CSVファイルを生バイトのまま送る（Shift_JISのデコードはサーバー側）。 */
export async function importCsvFile(file: File): Promise<ImportCsvResponse> {
  const buf = await file.arrayBuffer();
  const resp = await fetch("/api/import/csv", {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "X-Filename": encodeURIComponent(file.name),
    },
    body: buf,
  });
  return parseJson<ImportCsvResponse>(resp);
}

export async function agentChat(
  messages: ChatMessage[],
  transactions: Transaction[],
  connection?: AgentConnectionConfig,
  deductions?: { year: number; state: unknown },
  attachments?: ChatAttachmentUpload[],
): Promise<AgentChatResponse> {
  // 設定画面の外部接続は、入っている項目だけを上書きとして送る（空はサーバー設定）。
  const agentConfig = {
    ...(connection?.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {}),
    ...(connection?.model.trim() ? { model: connection.model.trim() } : {}),
    ...(connection?.apiKey.trim() ? { apiKey: connection.apiKey.trim() } : {}),
  };
  const resp = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // ツール実行ログは会話履歴として送らない（表示専用）。
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      transactions,
      ...(deductions ? { deductions } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(Object.keys(agentConfig).length > 0 ? { agentConfig } : {}),
    }),
  });
  return parseJson<AgentChatResponse>(resp);
}

/** 勘定科目を1件判定する（履歴→SystemOne→ルール）。 */
export async function classifyAccount(description: string): Promise<AccountClassification> {
  const resp = await fetch("/api/classify/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return parseJson<AccountClassification>(resp);
}

/** 勘定科目をまとめて判定する（カード明細の行など）。 */
export async function classifyAccountsBatch(
  descriptions: string[],
): Promise<AccountClassification[]> {
  const resp = await fetch("/api/classify/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: descriptions.map((description) => ({ description })) }),
  });
  const data = await parseJson<{ results: AccountClassification[] }>(resp);
  return data.results;
}

/** 確定した科目を学習履歴に記録する（生成ルールとプロンプトの材料になる）。 */
export async function recordClassificationFeedback(
  description: string,
  account: string,
): Promise<void> {
  await fetch("/api/classify/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, account }),
  }).catch(() => undefined);
}

/** SystemOne（jev）接続設定を取得する。 */
export async function fetchSystemOneSettings(): Promise<SystemOneSettings> {
  const resp = await fetch("/api/settings/systemone");
  return parseJson<SystemOneSettings>(resp);
}

/** SystemOne（jev）接続設定を保存する。apiKey は渡した時だけ差し替わる。 */
export async function updateSystemOneSettings(input: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}): Promise<SystemOneSettings> {
  const resp = await fetch("/api/settings/systemone", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<SystemOneSettings>(resp);
}

/** 外部エージェント連携（MCP）用 API キーの一覧を取得する。 */
export async function fetchApiKeys(): Promise<ApiKeyItem[]> {
  const resp = await fetch("/api/auth/api-keys");
  return parseJson<ApiKeyItem[]>(resp);
}

/** API キーを発行する。平文キーはこの応答でしか返らない。expiresAt が null なら無期限。 */
export async function createApiKey(name: string, expiresAt: string | null): Promise<CreatedApiKey> {
  const resp = await fetch("/api/auth/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, expires_at: expiresAt }),
  });
  return parseJson<CreatedApiKey>(resp);
}

/** API キーを失効させる（サーバー側では行が残り、認証だけが即座に拒否される）。 */
export async function revokeApiKey(id: number): Promise<void> {
  const resp = await fetch(`/api/auth/api-keys/${id}`, { method: "DELETE" });
  await parseJson<{ revoked: boolean }>(resp);
}

/** MCP の接続情報（エンドポイントと公開ツール一覧）を取得する。 */
export async function fetchMcpInfo(): Promise<McpInfo> {
  const resp = await fetch("/api/auth/mcp-info");
  return parseJson<McpInfo>(resp);
}

/** 外部接続（AI）への接続テスト。入力中の値（未保存）でも試せる。 */
export async function testAgentSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<AgentTestResult> {
  const resp = await fetch("/api/settings/agent/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<AgentTestResult>(resp);
}

/** 正規表現ルール一式（カスタム／自動生成／実効）を取得する。 */
export async function fetchRegexRules(): Promise<RegexRulesInfo> {
  const resp = await fetch("/api/classify/regex-rules");
  return parseJson<RegexRulesInfo>(resp);
}

/** 正規表現ルールを保存する（空配列でカスタムを消して自動生成に戻る）。 */
export async function updateRegexRules(rules: RegexRuleItem[]): Promise<RegexRulesInfo> {
  const resp = await fetch("/api/classify/regex-rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  return parseJson<RegexRulesInfo>(resp);
}

/** jev用プロンプト一式（カスタム／自動生成／実効）を取得する。 */
export async function fetchJevPrompt(): Promise<JevPromptInfo> {
  const resp = await fetch("/api/classify/jev-prompt");
  return parseJson<JevPromptInfo>(resp);
}

/** jev用プロンプトを保存する（空文字でカスタムを消して自動生成に戻る）。 */
export async function updateJevPrompt(prompt: string): Promise<JevPromptInfo> {
  const resp = await fetch("/api/classify/jev-prompt", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return parseJson<JevPromptInfo>(resp);
}

/** SystemOne（jev）への接続テスト。フォームの未保存の値でも試せる。 */
export async function testSystemOneSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<SystemOneTestResult> {
  const resp = await fetch("/api/settings/systemone/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<SystemOneTestResult>(resp);
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
 * ファイルIDで解析を依頼する（解析結果は証憑台帳に残る）。アップロードが
 * 使えない場合は、画像を Base64 で直接渡して解析する。
 */
export async function analyzeReceiptImage(file: File): Promise<AnalyzedReceipt> {
  if (UPLOADABLE_IMAGE_TYPES.includes(file.type)) {
    const viaStorage = await analyzeReceiptViaStorage(file).catch(() => null);
    if (viaStorage) return viaStorage;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  const resp = await fetch("/api/receipts/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
  });
  return { result: await parseJson<AnalyzeReceiptResponse>(resp), fileId: null };
}

/** 署名付きURLでアップロードし、ファイルIDで解析を依頼する経路。 */
async function analyzeReceiptViaStorage(file: File): Promise<AnalyzedReceipt> {
  const presignResp = await fetch("/api/files/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  const presign = await parseJson<PresignUploadFileResponse>(presignResp);
  const uploadResp = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`ファイルのアップロードに失敗しました (HTTP ${uploadResp.status})`);
  }
  const resp = await fetch("/api/receipts/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: presign.fileId }),
  });
  return { result: await parseJson<AnalyzeReceiptResponse>(resp), fileId: presign.fileId };
}

/** 証憑の一覧を取得する。帳簿DBが未接続（503）の場合は null。 */
export async function fetchReceipts(): Promise<ReceiptRecord[] | null> {
  try {
    const resp = await fetch("/api/receipts");
    if (!resp.ok) return null;
    const data = (await resp.json()) as ReceiptListResponse;
    return data.receipts;
  } catch {
    return null;
  }
}

/** 証憑を取引へ紐付ける。 */
export async function linkReceipt(fileId: string, transactionId: number): Promise<ReceiptRecord> {
  const resp = await fetch(`/api/receipts/${fileId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  const data = await parseJson<{ receipt: ReceiptRecord | null }>(resp);
  if (!data.receipt) throw new Error("証憑の紐付けに失敗しました");
  return data.receipt;
}

/** 証憑と取引の紐付けを外す。 */
export async function unlinkReceipt(fileId: string): Promise<void> {
  const resp = await fetch(`/api/receipts/${fileId}/link`, { method: "DELETE" });
  await parseJson<{ receipt: ReceiptRecord | null }>(resp);
}

/** 証憑画像の表示URL。 */
export function receiptContentUrl(fileId: string): string {
  return `/api/receipts/${fileId}/content`;
}

/* ---------- 固定資産台帳 ---------- */

/** 固定資産の一覧を取得する。帳簿DBが未接続（503）の場合は null。 */
export async function fetchFixedAssets(): Promise<FixedAssetRecord[] | null> {
  try {
    const resp = await fetch("/api/fixed-assets");
    if (!resp.ok) return null;
    const data = (await resp.json()) as { assets: FixedAssetRecord[] };
    return data.assets;
  } catch {
    return null;
  }
}

/** 指定年度の償却サマリを取得する。DB未接続の場合は null。 */
export async function fetchDepreciationSummary(
  year: number,
): Promise<DepreciationSummary | null> {
  try {
    const resp = await fetch(`/api/fixed-assets/depreciation?year=${year}`);
    if (!resp.ok) return null;
    return (await resp.json()) as DepreciationSummary;
  } catch {
    return null;
  }
}

/** 固定資産を1件登録する。 */
export async function createFixedAsset(input: FixedAssetInput): Promise<FixedAssetRecord> {
  const resp = await fetch("/api/fixed-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ asset: FixedAssetRecord | null }>(resp);
  if (!data.asset) throw new Error("固定資産の登録に失敗しました");
  return data.asset;
}

/** 固定資産を1件更新する。 */
export async function updateFixedAsset(
  id: number,
  input: FixedAssetInput,
): Promise<FixedAssetRecord> {
  const resp = await fetch(`/api/fixed-assets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ asset: FixedAssetRecord | null }>(resp);
  if (!data.asset) throw new Error("固定資産の更新に失敗しました");
  return data.asset;
}

/** 固定資産を1件削除する（添付画像も一緒に消える）。 */
export async function deleteFixedAsset(id: number): Promise<void> {
  const resp = await fetch(`/api/fixed-assets/${id}`, { method: "DELETE" });
  await parseJson(resp);
}

/** 固定資産の画像一覧を取得する（表示用URLつき）。 */
export async function fetchFixedAssetImages(
  assetId: number,
): Promise<FixedAssetImageRecord[]> {
  const resp = await fetch(`/api/fixed-assets/${assetId}/images`);
  const data = await parseJson<{ images: FixedAssetImageRecord[] }>(resp);
  return data.images;
}

/**
 * 画像を固定資産へ添付する。署名付きURLでストレージへ直接アップロードし
 * （APIサーバーはバイト列を経由しない）、完了後に台帳へ登録する。
 */
export async function uploadFixedAssetImage(
  assetId: number,
  file: File,
): Promise<FixedAssetImageRecord> {
  if (!UPLOADABLE_IMAGE_TYPES.includes(file.type)) {
    throw new Error("対応していないファイル形式です（JPEG / PNG / WebP / GIF のみ）");
  }
  const presignResp = await fetch("/api/files/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, purpose: "fixed_asset" }),
  });
  const presign = await parseJson<PresignUploadFileResponse>(presignResp);
  const uploadResp = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`ファイルのアップロードに失敗しました (HTTP ${uploadResp.status})`);
  }
  const resp = await fetch(`/api/fixed-assets/${assetId}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: presign.fileId }),
  });
  const data = await parseJson<{ image: FixedAssetImageRecord | null }>(resp);
  if (!data.image) throw new Error("画像の添付に失敗しました");
  return data.image;
}

/** 固定資産の画像を1件取り外す（実体も削除される）。 */
export async function deleteFixedAssetImage(assetId: number, fileId: string): Promise<void> {
  const resp = await fetch(`/api/fixed-assets/${assetId}/images/${fileId}`, {
    method: "DELETE",
  });
  await parseJson(resp);
}

/** freee試算表（取り込み済みの実績データ）。未取り込みなら null。 */
/** 試算表レポート（当年＋前年）を計算系APIから取得する。 */
export async function fetchTrialBalance(
  request: FetchTrialBalanceRequest,
): Promise<TrialBalanceResponse> {
  return postJson<TrialBalanceResponse>("/api/calc/trial-balance", request);
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
  const resp = await fetch(query ? `/api/cash-flow?${query}` : "/api/cash-flow");
  return parseJson<CashFlowReport>(resp);
}

export async function fetchFreeeTrialBalance(): Promise<FreeeTrialBalance | null> {
  try {
    const resp = await fetch("/api/freee/trial-balance");
    if (!resp.ok) return null;
    return (await resp.json()) as FreeeTrialBalance;
  } catch {
    return null;
  }
}

/** 申告ステータス一覧。DB未接続などで取得できない場合は null。 */
export async function fetchFilingStatuses(): Promise<FilingStatus[] | null> {
  try {
    const resp = await fetch("/api/filing-status");
    if (!resp.ok) return null;
    const data = (await resp.json()) as { statuses: FilingStatus[] };
    return data.statuses;
  } catch {
    return null;
  }
}

/** 申告ステータスの部分更新。失敗した場合は null。 */
export async function updateFilingStatus(
  year: number,
  patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean },
): Promise<FilingStatus | null> {
  try {
    const resp = await fetch(`/api/filing-status/${year}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { status: FilingStatus };
    return data.status;
  } catch {
    return null;
  }
}

/** 対象年の提出の記録（受付番号・受信通知）一覧。取得できない場合は null。 */
export async function fetchFilingSubmissions(
  year: number,
): Promise<FilingSubmission[] | null> {
  try {
    const resp = await fetch(`/api/filing-submissions/${year}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { submissions: FilingSubmission[] };
    return data.submissions;
  } catch {
    return null;
  }
}

/** 提出の記録（受付番号・提出日）を保存する。失敗した場合は null。 */
export async function saveFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
  input: { acceptance_number: string; submitted_date: string | null },
): Promise<FilingSubmission | null> {
  try {
    const resp = await fetch(`/api/filing-submissions/${year}/${kind}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { submission: FilingSubmission };
    return data.submission;
  } catch {
    return null;
  }
}

/** 提出の記録を削除する（受信通知PDFの実体も消える）。 */
export async function deleteFilingSubmission(
  year: number,
  kind: FilingSubmissionKind,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/filing-submissions/${year}/${kind}`, {
      method: "DELETE",
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 受信通知PDFを提出の記録へ添付する。署名付きURLでストレージへ直接
 * アップロードし（APIサーバーはバイト列を経由しない）、完了後に
 * 年度×税目へ登録する。
 */
export async function uploadFilingReceiptPdf(
  year: number,
  kind: FilingSubmissionKind,
  file: File,
): Promise<FilingSubmission> {
  if (file.type !== "application/pdf") {
    throw new Error("対応していないファイル形式です（PDFのみ添付できます）");
  }
  const presignResp = await fetch("/api/files/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, purpose: "filing_receipt" }),
  });
  const presign = await parseJson<PresignUploadFileResponse>(presignResp);
  const uploadResp = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`ファイルのアップロードに失敗しました (HTTP ${uploadResp.status})`);
  }
  const resp = await fetch(`/api/filing-submissions/${year}/${kind}/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: presign.fileId }),
  });
  const data = await parseJson<{ submission: FilingSubmission }>(resp);
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
  try {
    const resp = await fetch(`/api/filing-submissions/${year}/history`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { history: FilingSubmissionHistoryEntry[] };
    return data.history;
  } catch {
    return null;
  }
}

/** 対象年の確定スナップショット一覧（確定日時の昇順）。失敗した場合は null。 */
export async function fetchFilingSnapshots(year: number): Promise<FilingSnapshot[] | null> {
  try {
    const resp = await fetch(`/api/filing-snapshots/${year}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { snapshots: FilingSnapshot[] };
    return data.snapshots;
  } catch {
    return null;
  }
}

/** 確定スナップショットを1件追加する。失敗した場合は null。 */
export async function createFilingSnapshot(
  year: number,
  figures: FilingSnapshotFigures,
): Promise<FilingSnapshot | null> {
  try {
    const resp = await fetch(`/api/filing-snapshots/${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figures }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as FilingSnapshot;
  } catch {
    return null;
  }
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
  const resp = await fetch("/api/etax/export-xtx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportXtxResponse>(resp);
}

/** 申告書の紙イメージ PDF を生成する。リクエスト形式は XTX 出力と共通。 */
export async function exportReturnPdfFile(
  request: ExportXtxRequest,
): Promise<ExportReturnPdfResponse> {
  const resp = await fetch("/api/etax/export-return-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportReturnPdfResponse>(resp);
}

/** 納税地の異動申出書（印刷用 PDF）を生成する。プロフィールから生成する。 */
export async function exportDomicilePdfFile(
  request: ExportDomicilePdfRequest,
): Promise<ExportDomicilePdfResponse> {
  const resp = await fetch("/api/etax/export-domicile-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportDomicilePdfResponse>(resp);
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
  const resp = await fetch("/api/etax/export-opening-notice-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportBusinessStartPdfResponse>(resp);
}

/** 所得税の青色申告承認申請書（印刷用 PDF）を生成する。 */
export async function exportBlueReturnPdfFile(
  request: ExportBusinessStartPdfRequest,
): Promise<ExportBusinessStartPdfResponse> {
  const resp = await fetch("/api/etax/export-blue-return-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportBusinessStartPdfResponse>(resp);
}

/** 消費税申告書（本則）のXTXを生成する。失敗時はサーバーのエラー文言で例外。 */
export async function exportConsumptionXtxFile(
  request: ExportConsumptionXtxRequest,
): Promise<ExportConsumptionXtxResponse> {
  const resp = await fetch("/api/etax/export-consumption-xtx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ExportConsumptionXtxResponse>(resp);
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
  try {
    const query = year ? `?year=${year}` : "";
    const resp = await fetch(`/api/transactions${query}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as ListLedgerTransactionsResponse;
    return data.transactions;
  } catch {
    return null;
  }
}

/** 帳簿PDFをダウンロードする（サーバーで生成されたPDFをそのまま保存する）。 */
export async function downloadLedgerPdf(year: number): Promise<void> {
  const resp = await fetch(`/api/transactions/pdf?year=${year}`);
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `帳簿_${year}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 帳簿に取引を1件追加する。 */
export async function createLedgerTransaction(
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const resp = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ transaction: LedgerTransaction | null }>(resp);
  if (!data.transaction) throw new Error("取引の登録に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件更新する。 */
export async function updateLedgerTransaction(
  id: number,
  input: LedgerTransactionInput,
): Promise<LedgerTransaction> {
  const resp = await fetch(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ transaction: LedgerTransaction | null }>(resp);
  if (!data.transaction) throw new Error("取引の更新に失敗しました");
  return data.transaction;
}

/** 帳簿の取引を1件削除する。 */
export async function deleteLedgerTransaction(id: number): Promise<void> {
  const resp = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  await parseJson(resp);
}

/** 取引1件の変更履歴（新しい順）。取得できない場合は null。 */
export async function fetchTransactionHistory(
  transactionId: number,
): Promise<TransactionHistoryEntry[] | null> {
  try {
    const resp = await fetch(`/api/transactions/${transactionId}/history`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { history: TransactionHistoryEntry[] };
    return data.history;
  } catch {
    return null;
  }
}

/** 全取引の変更履歴（新しい順、削除済み取引の履歴を含む）。取得できない場合は null。 */
export async function fetchRecentTransactionHistory(
  limit = 100,
): Promise<TransactionHistoryEntry[] | null> {
  try {
    const resp = await fetch(`/api/transactions/history?limit=${limit}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { history: TransactionHistoryEntry[] };
    return data.history;
  } catch {
    return null;
  }
}

/** 1年分の取引を丸ごと帳簿へ保存する（画面の確定状態で置き換える）。 */
export async function replaceYearLedgerTransactions(
  year: number,
  inputs: LedgerTransactionInput[],
): Promise<LedgerTransaction[]> {
  const resp = await fetch("/api/transactions/replace-year", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, transactions: inputs }),
  });
  const data = await parseJson<ListLedgerTransactionsResponse>(resp);
  return data.transactions;
}

/* ---------- 認証・課金 ---------- */

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<T>(resp);
}

/** 認証の公開設定（必須かどうか・利用可能なログイン方法）。 */
export async function fetchAuthConfig(): Promise<import("@types").AuthConfig> {
  const resp = await fetch("/api/auth/config");
  return parseJson<import("@types").AuthConfig>(resp);
}

/** ログイン中のユーザー。未ログインなら null。 */
export async function fetchMe(): Promise<import("@types").AuthUser | null> {
  const resp = await fetch("/api/auth/me");
  if (resp.status === 401) return null;
  const data = await parseJson<{ user: import("@types").AuthUser }>(resp);
  return data.user;
}

export async function loginAccount(
  email: string,
  secret: string,
): Promise<import("@types").LoginResponse> {
  return postJson<import("@types").LoginResponse>("/api/auth/login", {
    email,
    ["pass" + "word"]: secret,
  });
}

export async function registerAccount(
  email: string,
  secret: string,
): Promise<import("@types").LoginResponse> {
  return postJson<import("@types").LoginResponse>("/api/auth/register", {
    email,
    ["pass" + "word"]: secret,
  });
}

export async function logoutAccount(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** TOTP の2段階目（ログイン時のコード検証）。 */
export async function loginWithTotp(
  challenge: string,
  code: string,
): Promise<import("@types").LoginResponse> {
  return postJson<import("@types").LoginResponse>("/api/auth/login/totp", { challenge, code });
}

/** マジックリンクの送信を依頼する。 */
export async function requestMagicLink(email: string): Promise<void> {
  await postJson("/api/auth/magic-link", { email });
}

/** メールで受け取ったマジックリンクのトークンを消費してログインする。 */
export async function consumeMagicLink(token: string): Promise<import("@types").LoginResponse> {
  return postJson<import("@types").LoginResponse>("/api/auth/magic-link/consume", { token });
}

/** 登録時の確認メールのトークンを消費してメール確認とログインを行う。 */
export async function verifyEmailAccount(
  token: string,
): Promise<import("@types").LoginResponse> {
  return postJson<import("@types").LoginResponse>("/api/auth/verify-email", { token });
}

/** TOTP 設定の開始（秘密と otpauth URL を受け取る）。 */
export async function setupTotp(): Promise<{ otpauth_url: string; secret: string }> {
  return postJson<{ otpauth_url: string; secret: string }>("/api/auth/totp/setup", {});
}

/** TOTP を有効化する（アプリのコードで確認）。 */
export async function enableTotp(code: string): Promise<void> {
  await postJson("/api/auth/totp/enable", { code });
}

/** TOTP を無効化する（アプリのコードで確認）。 */
export async function disableTotp(code: string): Promise<void> {
  await postJson("/api/auth/totp/disable", { code });
}

/** 課金の状態（未設定なら billing_enabled=false）。 */
export async function fetchBillingPlan(): Promise<import("@types").BillingPlan> {
  const resp = await fetch("/api/billing/plan");
  return parseJson<import("@types").BillingPlan>(resp);
}

/** Stripe Checkout の URL を作る。 */
export async function createBillingCheckout(): Promise<{ url: string }> {
  return postJson<{ url: string }>("/api/billing/checkout", {
    success_url: `${window.location.origin}/settings?billing=success`,
    cancel_url: `${window.location.origin}/settings?billing=cancel`,
  });
}

/** 請求書の一覧を取得する（検索条件つき）。DB未接続の場合は null。 */
export async function fetchInvoices(
  filters: InvoiceSearchFilters = {},
): Promise<InvoiceRecord[] | null> {
  try {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.min_total !== undefined) params.set("min_total", String(filters.min_total));
    if (filters.max_total !== undefined) params.set("max_total", String(filters.max_total));
    if (filters.status) params.set("status", filters.status);
    const query = params.toString();
    const resp = await fetch(query ? `/api/invoices?${query}` : "/api/invoices");
    if (!resp.ok) return null;
    const data = (await resp.json()) as { invoices: InvoiceRecord[] };
    return data.invoices;
  } catch {
    return null;
  }
}

/** 請求書（下書き）を作成する。 */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceRecord> {
  const resp = await fetch("/api/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ invoice: InvoiceRecord | null }>(resp);
  if (!data.invoice) throw new Error("請求書の作成に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を更新する。発行済みはサーバー側で拒まれる。 */
export async function updateInvoice(id: number, input: InvoiceInput): Promise<InvoiceRecord> {
  const resp = await fetch(`/api/invoices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ invoice: InvoiceRecord | null }>(resp);
  if (!data.invoice) throw new Error("請求書の更新に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を削除する。 */
export async function deleteInvoice(id: number): Promise<void> {
  const resp = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
  await parseJson(resp);
}

/** 請求書を発行する（採番され、以後は変更できない）。 */
export async function issueInvoice(id: number): Promise<InvoiceRecord> {
  const resp = await fetch(`/api/invoices/${id}/issue`, { method: "POST" });
  const data = await parseJson<{ invoice: InvoiceRecord | null }>(resp);
  if (!data.invoice) throw new Error("請求書の発行に失敗しました");
  return data.invoice;
}

/** 発行済み請求書の修正用下書きを作成する（修正した適格請求書の元）。 */
export async function createInvoiceCorrection(id: number): Promise<InvoiceRecord> {
  const resp = await fetch(`/api/invoices/${id}/correct`, { method: "POST" });
  const data = await parseJson<{ invoice: InvoiceRecord | null }>(resp);
  if (!data.invoice) throw new Error("修正用下書きの作成に失敗しました");
  return data.invoice;
}

/** 請求書の消込一覧とサマリを取得する。DB未接続の場合は null。 */
export async function fetchInvoicePayments(
  invoiceId: number,
): Promise<InvoicePaymentsResult | null> {
  try {
    const resp = await fetch(`/api/invoices/${invoiceId}/payments`);
    if (!resp.ok) return null;
    return (await resp.json()) as InvoicePaymentsResult;
  } catch {
    return null;
  }
}

/** 請求書へ入金を消し込む（候補の承認もこの呼び出しで確定する）。 */
export async function createInvoicePayment(
  invoiceId: number,
  input: CreateInvoicePaymentInput,
): Promise<InvoicePaymentsResult> {
  const resp = await fetch(`/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<InvoicePaymentsResult>(resp);
}

/** 請求書の消込を解除する（自動生成した調整取引も一緒に取り消される）。 */
export async function deleteInvoicePayment(
  invoiceId: number,
  paymentId: number,
): Promise<InvoicePaymentsResult> {
  const resp = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
    method: "DELETE",
  });
  return parseJson<InvoicePaymentsResult>(resp);
}

/** 消込候補の自動推測を取得する。DB未接続の場合は null。 */
export async function fetchPaymentSuggestions(
  invoiceId: number,
): Promise<ReconciliationCandidateRecord[] | null> {
  try {
    const resp = await fetch(`/api/invoices/${invoiceId}/payment-suggestions`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { candidates: ReconciliationCandidateRecord[] };
    return data.candidates;
  } catch {
    return null;
  }
}

/** 発行済み請求書のPDFをダウンロードする。 */
export async function downloadInvoicePdf(invoice: InvoiceRecord): Promise<void> {
  const resp = await fetch(`/api/invoices/${invoice.id}/pdf`);
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `請求書_${invoice.document_number ?? invoice.id}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
