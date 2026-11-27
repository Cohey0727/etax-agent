/**
 * deleteFilingSubmission.ts — 提出の記録を削除する（usecases）。DB必須。
 * Issue #28 Phase 1。
 *
 * 記録の行と受信通知PDFの実体を消す。変更履歴（filing_submission_history）
 * には削除前後のスナップショットが残るため、消した事実と内容は後から
 * 追える（電子帳簿保存法の訂正・削除履歴に相当）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import {
  DeleteFilingSubmissionResponseSchema,
  FilingSubmissionKindParamSchema,
} from "../schemas/filingSubmission";
import {
  deleteFilingSubmissionRecord,
  FilingSubmissionError,
} from "../services/filingSubmission/filingSubmissionRecords";

export const deleteFilingSubmissionRoute = createRoute({
  method: "delete",
  path: "/api/filing-submissions/{year}/{kind}",
  operationId: "deleteFilingSubmission",
  tags: ["FilingSubmissions"],
  summary: "提出の記録を削除（DB必須）",
  request: { params: FilingSubmissionKindParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: DeleteFilingSubmissionResponseSchema } },
      description: "削除完了",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の記録が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const deleteFilingSubmissionHandler: RouteHandler<
  typeof deleteFilingSubmissionRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const params = c.req.valid("param");
  const { year } = params;
  try {
    await deleteFilingSubmissionRecord(db, year, params.kind);
  } catch (e) {
    if (e instanceof FilingSubmissionError) {
      throw new HTTPException(e.status, { message: e.message });
    }
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json({ message: "提出の記録を削除しました" }, 200);
};
