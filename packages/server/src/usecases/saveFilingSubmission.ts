/**
 * saveFilingSubmission.ts — 提出の記録（受付番号・提出日）を保存する
 * （usecases）。DB必須。Issue #28 Phase 1。
 *
 * 受付番号が記録されたら、申告ステータスの「提出済み（submitted）」を
 * 立てる（表示との連動）。受付番号を空にしても提出済みは自動では
 * 戻さない（もう一方の税目の提出で立っている場合があるため）。
 * ボディ検証はハンドラ側で行う（updateFilingStatus と同じ流儀）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { ErrorSchema } from "../schemas/common";
import {
  FilingSubmissionResponse,
  FilingSubmissionKindParamSchema,
  SaveFilingSubmissionRequestSchema,
  SingleFilingSubmissionResponse,
  SingleFilingSubmissionResponseSchema,
} from "../schemas/filingSubmission";
import { saveFilingSubmissionRecord } from "../services/filingSubmission/filingSubmissionRecords";

export const saveFilingSubmissionRoute = createRoute({
  method: "put",
  path: "/api/filing-submissions/{year}/{kind}",
  operationId: "saveFilingSubmission",
  tags: ["FilingSubmissions"],
  summary: "提出の記録（受付番号・提出日）を保存（DB必須）",
  request: { params: FilingSubmissionKindParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleFilingSubmissionResponseSchema } },
      description: "保存された提出の記録",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year・kind またはボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const saveFilingSubmissionHandler: RouteHandler<
  typeof saveFilingSubmissionRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const params = c.req.valid("param");
  const { year } = params;
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = SaveFilingSubmissionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "受付番号・提出日が不正です" });
  }
  let submission: FilingSubmissionResponse;
  try {
    submission = await saveFilingSubmissionRecord(db, year, params.kind, parsed.data);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: SingleFilingSubmissionResponse = { submission };
  return c.json(response, 200);
};
