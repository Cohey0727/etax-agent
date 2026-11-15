/**
 * analyzeReceipt.ts — 領収書画像の解析ユースケース（usecases）。
 * 画像対応LLMで日付・金額・支払先・摘要を読み取り、続けて勘定科目を
 * 判定して「帳簿ドラフト」を返す。帳簿への追加は画面側の確定操作で行う。
 *
 * 画像の受け取りは2経路:
 *   1. fileId: アップロード受け口URLでローカル保存済みのもの。
 *      サーバーが内部エンドポイントから取得する。
 *   2. imageBase64 + mimeType: 従来経路（ストレージ未設定時のフォールバック）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createLlmClient } from "../gateways/llmGateway";
import {
  createStorageClient,
  receiptObjectKey,
  StorageError,
  StorageObjectNotFoundError,
} from "../gateways/storageGateway";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import {
  getJevPromptOverride,
  getRegexRulesOverride,
  loadAgentConfig,
  loadStorageConfig,
  loadSystemOneConfig,
} from "../lib/config";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import { ErrorSchema } from "../schemas/common";
import { AnalyzeReceiptRequestSchema, AnalyzeReceiptResponseSchema } from "../schemas/receipt";
import { classifyAccount } from "../services/classification/classifyAccount";
import { extractReceipt, ReceiptImage } from "../services/receipts/extractReceipt";

export const analyzeReceiptRoute = createRoute({
  method: "post",
  path: "/api/receipts/analyze",
  operationId: "analyzeReceipt",
  tags: ["Receipts"],
  summary: "領収書画像の読み取り＋科目判定",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AnalyzeReceiptRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AnalyzeReceiptResponseSchema } },
      description: "帳簿ドラフト",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正・指定が不足",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "fileId のファイルが存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "LLM未設定・ストレージ未設定・読み取り失敗",
    },
  },
});

const RECEIPT_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** リクエストから解析対象の画像（Base64 + MIME）を解決する。 */
async function resolveReceiptImage(body: {
  fileId?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<ReceiptImage> {
  if (body.fileId && body.imageBase64) {
    throw new HTTPException(400, {
      message: "fileId と imageBase64 は同時に指定できません",
    });
  }
  if (body.fileId) {
    const storageConfig = loadStorageConfig();
    try {
      const storage = createStorageClient(storageConfig);
      const downloaded = await storage.download(receiptObjectKey(body.fileId));
      if (!RECEIPT_MIME_TYPES.includes(downloaded.mimeType)) {
        throw new HTTPException(400, {
          message: `対応していない画像形式です: ${downloaded.mimeType}`,
        });
      }
      return {
        mimeType: downloaded.mimeType,
        dataBase64: downloaded.dataBase64,
      };
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      if (e instanceof StorageObjectNotFoundError) {
        throw new HTTPException(404, { message: e.message });
      }
      if (e instanceof StorageError) {
        throw new HTTPException(503, { message: e.message });
      }
      throw e;
    }
  }
  if (body.imageBase64 && body.mimeType) {
    return {
      mimeType: body.mimeType,
      dataBase64: body.imageBase64,
    };
  }
  throw new HTTPException(400, {
    message: "fileId、または imageBase64 と mimeType の組み合わせを指定してください",
  });
}

export const analyzeReceiptHandler: RouteHandler<typeof analyzeReceiptRoute> = async (c) => {
  const body = c.req.valid("json");
  const agentConfig = loadAgentConfig();
  if (!agentConfig.apiKey) {
    throw new HTTPException(503, {
      message: "AGENT_API_KEY が設定されていないため、画像の読み取りができません",
    });
  }
  const image = await resolveReceiptImage(body);
  const llm = createLlmClient(agentConfig);
  let extracted;
  try {
    extracted = await extractReceipt(image, llm);
  } catch (e) {
    throw new HTTPException(503, {
      message: e instanceof Error ? e.message : String(e),
    });
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
  return c.json({ ...extracted, classification }, 200);
};
