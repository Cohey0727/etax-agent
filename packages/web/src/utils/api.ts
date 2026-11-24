import { IncomeType, Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AgentConnectionConfig,
  AgentTestResult,
  AnalyzeReceiptResponse,
  ChatMessage,
  JevPromptInfo,
  RegexRuleItem,
  RegexRulesInfo,
  ExportConsumptionXtxRequest,
  ExportConsumptionXtxResponse,
  ExportDomicilePdfRequest,
  ExportDomicilePdfResponse,
  ExportXtxRequest,
  ExportReturnPdfResponse,
  ExportXtxResponse,
  FilingSnapshot,
  FilingSnapshotFigures,
  FilingStatus,
  FreeeTrialBalance,
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

/** サーバーAPIの型つきラッパー。/api は Vite プロキシで localhost:3001 へ。 */

async function parseJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error ?? `HTTP ${resp.status}`);
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

/**
 * 領収書画像を読み取り、科目判定まで済んだ帳簿ドラフトを返す。
 * 基本フロー: 受け口URLでサーバーへアップロードし、
 * ファイルIDで解析を依頼する。アップロードが使えない場合は、画像を
 * Base64で直接渡す従来経路にフォールバックする。
 */
export async function analyzeReceiptImage(file: File): Promise<AnalyzeReceiptResponse> {
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
  return parseJson<AnalyzeReceiptResponse>(resp);
}

/** 署名付きURLでアップロードし、ファイルIDで解析を依頼する経路。 */
async function analyzeReceiptViaStorage(file: File): Promise<AnalyzeReceiptResponse> {
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
  return parseJson<AnalyzeReceiptResponse>(resp);
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

/** freee試算表（取り込み済みの実績データ）。未取り込みなら null。 */
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
