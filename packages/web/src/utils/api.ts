import { IncomeType, Transaction } from "@etax/shared";
import {
  AccountClassification,
  AgentChatResponse,
  AgentConnectionConfig,
  AnalyzeReceiptResponse,
  ChatMessage,
  ExportConsumptionXtxRequest,
  ExportConsumptionXtxResponse,
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
      messages,
      transactions,
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

/** 確定した科目を学習履歴に記録する（次回から「過去の傾向」で優先される）。 */
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
    year: Number(row.date.slice(0, 4)),
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
