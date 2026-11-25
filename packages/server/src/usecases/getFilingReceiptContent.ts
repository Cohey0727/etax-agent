/**
 * getFilingReceiptContent.ts — 受信通知PDFの取得ユースケース（usecases）。
 * Issue #28 Phase 1。
 *
 * 提出の記録に紐づくファイルだけを配信する（台帳に無いファイルIDは
 * 引けない構造で、他テナントの受信通知も存在しないものとして扱う）。
 * 配信は領収書画像と同じく nosniff + CSP sandbox で封じる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  createStorageClient,
  filingReceiptObjectKey,
  StorageError,
  StorageObjectNotFoundError,
} from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { getDb } from "../lib/db";
import { databaseUnavailableMessage } from "../lib/errors";
import { servedDocumentContentType } from "../lib/uploadTypes";
import { getFilingSubmissionRow } from "../repositories/filingSubmissionRepository";
import { ErrorSchema } from "../schemas/common";
import { FilingSubmissionKindParamSchema } from "../schemas/filingSubmission";

export const getFilingReceiptContentRoute = createRoute({
  method: "get",
  path: "/api/filing-submissions/{year}/{kind}/receipt/content",
  operationId: "getFilingReceiptContent",
  tags: ["FilingSubmissions"],
  summary: "受信通知PDFの取得",
  request: { params: FilingSubmissionKindParamSchema },
  responses: {
    200: { description: "受信通知PDF" },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "受信通知が添付されていない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB/ストレージ未設定・取得失敗",
    },
  },
});

export const getFilingReceiptContentHandler: RouteHandler<
  typeof getFilingReceiptContentRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const params = c.req.valid("param");
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
  const row = await getFilingSubmissionRow(db, year, params.kind);
  if (!row?.receiptFileId) {
    throw new HTTPException(404, { message: "受信通知が添付されていません" });
  }
  try {
    const storage = createStorageClient(loadStorageConfig());
    const downloaded = await storage.download(filingReceiptObjectKey(row.receiptFileId));
    const bytes = Buffer.from(downloaded.dataBase64, "base64");
    return c.body(bytes, 200, {
      "Content-Type": servedDocumentContentType(row.receiptMimeType),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline; filename=\"etax-receipt-notice.pdf\"",
    });
  } catch (e) {
    if (e instanceof StorageObjectNotFoundError) {
      throw new HTTPException(404, { message: e.message });
    }
    if (e instanceof StorageError) {
      throw new HTTPException(503, { message: e.message });
    }
    throw e;
  }
};
