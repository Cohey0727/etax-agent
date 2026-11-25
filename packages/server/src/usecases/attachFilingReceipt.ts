/**
 * attachFilingReceipt.ts — 受信通知PDFを提出の記録へ添付する（usecases）。
 * DB必須。Issue #28 Phase 1。
 *
 * PDFの実体は署名付きURLでブラウザからストレージへ直接アップロード済み。
 * ここでは実在を HEAD で確認し、形式が PDF であることを検証してから
 * 登録する（固定資産画像の添付と同じ流儀）。差し替え時は旧ファイルの
 * 実体を消し、変更履歴に付け替えの前後が残る。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  createStorageClient,
  filingReceiptObjectKey,
  StorageError,
} from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { isAllowedDocumentContentType, normalizeContentType } from "../lib/uploadTypes";
import {
  filingSubmissionToApi,
  getFilingSubmissionRow,
  getFilingSubmissionRowByFileId,
  upsertFilingSubmissionRow,
} from "../repositories/filingSubmissionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  AttachFilingReceiptRequestSchema,
  FilingSubmissionKindParamSchema,
  SingleFilingSubmissionResponse,
  SingleFilingSubmissionResponseSchema,
} from "../schemas/filingSubmission";

export const attachFilingReceiptRoute = createRoute({
  method: "post",
  path: "/api/filing-submissions/{year}/{kind}/receipt",
  operationId: "attachFilingReceipt",
  tags: ["FilingSubmissions"],
  summary: "受信通知PDFを提出の記録へ添付（DB必須）",
  request: { params: FilingSubmissionKindParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: SingleFilingSubmissionResponseSchema } },
      description: "添付後の提出の記録",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正・アップロード未確認・PDF以外の形式",
    },
    409: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "同じファイルが添付済み",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB/ストレージ未設定または接続不可",
    },
  },
});

export const attachFilingReceiptHandler: RouteHandler<typeof attachFilingReceiptRoute> = async (
  c,
) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const params = c.req.valid("param");
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = AttachFilingReceiptRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "file_id が不正です" });
  }
  const fileId = parsed.data.file_id;
  const storage = createStorageClient(loadStorageConfig());
  let row;
  let replacedFileId: string | null = null;
  try {
    const existing = await getFilingSubmissionRowByFileId(db, fileId);
    if (existing) {
      throw new HTTPException(409, { message: "このファイルは添付済みです" });
    }
    // 実体がストレージにあることを確認してから登録する。
    const head = await storage.head(filingReceiptObjectKey(fileId));
    if (!head) {
      throw new HTTPException(400, { message: "アップロードされたファイルが確認できません" });
    }
    const mimeType = normalizeContentType(head.contentType);
    if (!isAllowedDocumentContentType(mimeType)) {
      await storage.deleteObject(filingReceiptObjectKey(fileId)).catch(() => undefined);
      throw new HTTPException(400, {
        message: "対応していないファイル形式です（受信通知はPDFのみ添付できます）",
      });
    }
    const before = await getFilingSubmissionRow(db, year, params.kind);
    replacedFileId =
      before?.receiptFileId && before.receiptFileId !== fileId ? before.receiptFileId : null;
    row = await upsertFilingSubmissionRow(db, year, params.kind, {
      receiptFileId: fileId,
      receiptMimeType: mimeType,
    });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    if (e instanceof StorageError) throw new HTTPException(503, { message: e.message });
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  // 差し替え前の実体は残さない（履歴には付け替えの前後が残る）。
  if (replacedFileId) {
    await storage.deleteObject(filingReceiptObjectKey(replacedFileId)).catch(() => undefined);
  }
  const response: SingleFilingSubmissionResponse = { submission: filingSubmissionToApi(row) };
  return c.json(response, 201);
};
