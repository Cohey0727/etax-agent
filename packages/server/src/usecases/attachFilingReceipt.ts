/**
 * attachFilingReceipt.ts — 受信通知PDFを提出の記録へ添付する（usecases）。
 * DB必須。
 *
 * PDFの実体は署名付きURLでブラウザからストレージへ直接アップロード済み。
 * ここでは実在を HEAD で確認し、形式が PDF であることを検証してから
 * 登録する（固定資産画像の添付と同じ流儀）。差し替え時は旧ファイルの
 * 実体を消し、変更履歴に付け替えの前後が残る。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, filingReceiptObjectKey } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  isAllowedDocumentContentType,
  MAX_UPLOAD_BYTES,
  normalizeContentType,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "../lib/uploadTypes";
import { getFilingSubmissionRowByFileId } from "../repositories/filingSubmissionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  AttachFilingReceiptRequestSchema,
  FilingSubmissionResponse,
  FilingSubmissionKindParamSchema,
  SingleFilingSubmissionResponse,
  SingleFilingSubmissionResponseSchema,
} from "../schemas/filingSubmission";
import { attachFilingReceiptRecord } from "../services/filingSubmission/filingSubmissionRecords";

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
  const db = requireDb();
  const params = c.req.valid("param");
  const { year } = params;
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = AttachFilingReceiptRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "file_id が不正です" });
  }
  const fileId = parsed.data.file_id;
  const storage = createStorageClient(loadStorageConfig());
  const existing = await getFilingSubmissionRowByFileId(db, fileId);
  if (existing) {
    throw new HTTPException(409, { message: "このファイルは添付済みです" });
  }
  // 実体がストレージにあることを確認してから登録する。
  const head = await storage.head(filingReceiptObjectKey(fileId));
  if (!head) {
    throw new HTTPException(400, { message: "アップロードされたファイルが確認できません" });
  }
  if (head.size > MAX_UPLOAD_BYTES) {
    await storage.deleteObject(filingReceiptObjectKey(fileId)).catch(() => undefined);
    throw new HTTPException(400, { message: UPLOAD_TOO_LARGE_MESSAGE });
  }
  const mimeType = normalizeContentType(head.contentType);
  if (!isAllowedDocumentContentType(mimeType)) {
    await storage.deleteObject(filingReceiptObjectKey(fileId)).catch(() => undefined);
    throw new HTTPException(400, {
      message: "対応していないファイル形式です（受信通知はPDFのみ添付できます）",
    });
  }
  // 登録と、差し替え時の旧ファイルの実体削除はサービス側で行う。
  const submission: FilingSubmissionResponse = await attachFilingReceiptRecord(db, year, params.kind, fileId, mimeType);
  const response: SingleFilingSubmissionResponse = { submission };
  return c.json(response, 201);
};
