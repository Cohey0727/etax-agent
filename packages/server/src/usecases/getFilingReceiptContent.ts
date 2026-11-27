/**
 * getFilingReceiptContent.ts — 受信通知PDFの取得ユースケース（usecases）。
 * Issue #28 Phase 1。
 *
 * 提出の記録に紐づくファイルだけを配信する（台帳に無いファイルIDは
 * 引けない構造で、他テナントの受信通知も存在しないものとして扱う）。
 * 配信は領収書画像と同じく nosniff + CSP sandbox で封じる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { FilingSubmissionKindParamSchema } from "../schemas/filingSubmission";
import { getFilingReceiptBytes } from "../services/filingSubmission/filingSubmissionRecords";

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
  const db = requireDb();
  const params = c.req.valid("param");
  const { year } = params;
  let result: { filename: string; mimeType: string; dataBase64: string };
  result = await getFilingReceiptBytes(db, year, params.kind);
  const bytes = Buffer.from(result.dataBase64, "base64");
  return c.body(bytes, 200, {
    "Content-Type": result.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `inline; filename="${result.filename}"`,
  });
};
