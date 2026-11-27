/**
 * analyzeReceiptDraft.ts — 領収書画像の解析（読み取り＋科目判定）の共通処理
 * （services/receipts）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う。画像対応LLMで
 * 日付・金額・支払先・摘要を読み取り、続けて勘定科目を判定して「帳簿
 * ドラフト」を返す。帳簿への追加は呼び出し側の確定操作で行う（ここでは
 * 追加しない）。fileId 経路では解析結果を証憑台帳へ記録する（失敗しても
 * 解析結果は返す）。
 *
 * 画像の受け取りは2経路:
 *   1. fileId: ストレージへ保存済みのもの（upload_receipt / presign 経由）。
 *   2. imageBase64 + mimeType: 直接渡す経路。
 */
import { createLlmClient } from "../../gateways/llmGateway";
import {
  createStorageClient,
  receiptObjectKey,
  StorageError,
  StorageObjectNotFoundError,
} from "../../gateways/storageGateway";
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import {
  getJevPromptOverride,
  getRegexRulesOverride,
  loadAgentConfig,
  loadStorageConfig,
  loadSystemOneConfig,
} from "../../lib/config";
import { Db } from "../../lib/db";
import { ALLOWED_UPLOAD_CONTENT_TYPES } from "../../lib/uploadTypes";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { upsertReceiptExtraction } from "../../repositories/receiptRepository";
import { AnalyzeReceiptResponse } from "../../schemas/receipt";
import { classifyAccount } from "../classification/classifyAccount";
import { extractReceipt, ReceiptImage } from "./extractReceipt";
import { BusinessError } from "../../lib/errors";

/** 領収書解析まわりの業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class ReceiptAnalysisError extends BusinessError {}

export interface AnalyzeReceiptDraftInput {
  fileId?: string;
  imageBase64?: string;
  mimeType?: string;
}

/** リクエストから解析対象の画像（Base64 + MIME）を解決する。 */
async function resolveReceiptImage(input: AnalyzeReceiptDraftInput): Promise<ReceiptImage> {
  if (input.fileId && input.imageBase64) {
    throw new ReceiptAnalysisError(400, "fileId と imageBase64 は同時に指定できません");
  }
  if (input.fileId) {
    const storageConfig = loadStorageConfig();
    try {
      const storage = createStorageClient(storageConfig);
      const downloaded = await storage.download(receiptObjectKey(input.fileId));
      if (!(ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(downloaded.mimeType)) {
        throw new ReceiptAnalysisError(
          400,
          `対応していない画像形式です: ${downloaded.mimeType}`,
        );
      }
      return { mimeType: downloaded.mimeType, dataBase64: downloaded.dataBase64 };
    } catch (e) {
      if (e instanceof ReceiptAnalysisError) throw e;
      if (e instanceof StorageObjectNotFoundError) {
        throw new ReceiptAnalysisError(404, e.message);
      }
      if (e instanceof StorageError) {
        throw new ReceiptAnalysisError(503, e.message);
      }
      throw e;
    }
  }
  if (input.imageBase64 && input.mimeType) {
    return { mimeType: input.mimeType, dataBase64: input.imageBase64 };
  }
  throw new ReceiptAnalysisError(
    400,
    "fileId、または imageBase64 と mimeType の組み合わせを指定してください",
  );
}

/** 領収書画像を解析して帳簿ドラフト（読み取り結果＋科目判定）を返す。 */
export async function analyzeReceiptDraft(
  db: Db | null,
  input: AnalyzeReceiptDraftInput,
): Promise<AnalyzeReceiptResponse> {
  const agentConfig = loadAgentConfig();
  if (!agentConfig.apiKey) {
    throw new ReceiptAnalysisError(
      503,
      "AGENT_API_KEY が設定されていないため、画像の読み取りができません",
    );
  }
  const image = await resolveReceiptImage(input);
  const llm = createLlmClient(agentConfig);
  let extracted;
  try {
    extracted = await extractReceipt(image, llm);
  } catch (e) {
    throw new ReceiptAnalysisError(503, e instanceof Error ? e.message : String(e));
  }
  const state = [extracted.payee, extracted.description].filter(Boolean).join(" ");
  const history = await loadClassificationHistory();
  const systemOne = createSystemOneClient(loadSystemOneConfig());
  const classification = await classifyAccount(state || extracted.description, {
    history,
    systemOne,
    jevPromptOverride: getJevPromptOverride(),
    regexRulesOverride: getRegexRulesOverride(),
  });
  const result = { ...extracted, classification };
  // 証憑と取引の紐付けの土台として、fileId 経路の解析結果を証憑台帳へ
  // 記録する（DB未設定・記録失敗でも解析自体は成功として返す）。
  if (input.fileId && db) {
    try {
      await upsertReceiptExtraction(db, input.fileId, image.mimeType, result);
    } catch {
      // 証憑台帳への記録は付随処理のため、失敗しても解析結果は返す
    }
  }
  return result;
}
