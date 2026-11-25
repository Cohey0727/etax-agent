/**
 * filingSubmissions.ts — 提出の記録ルートの登録（routes: 登録のみ、
 * ロジックは持たない）。Issue #28 Phase 1。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  attachFilingReceiptHandler,
  attachFilingReceiptRoute,
} from "../usecases/attachFilingReceipt";
import {
  deleteFilingSubmissionHandler,
  deleteFilingSubmissionRoute,
} from "../usecases/deleteFilingSubmission";
import {
  getFilingReceiptContentHandler,
  getFilingReceiptContentRoute,
} from "../usecases/getFilingReceiptContent";
import {
  getFilingSubmissionHistoryHandler,
  getFilingSubmissionHistoryRoute,
} from "../usecases/getFilingSubmissionHistory";
import {
  getFilingSubmissionsHandler,
  getFilingSubmissionsRoute,
} from "../usecases/getFilingSubmissions";
import {
  saveFilingSubmissionHandler,
  saveFilingSubmissionRoute,
} from "../usecases/saveFilingSubmission";

const app = new OpenAPIHono();
app.openapi(getFilingSubmissionsRoute, getFilingSubmissionsHandler);
app.openapi(getFilingSubmissionHistoryRoute, getFilingSubmissionHistoryHandler);
app.openapi(saveFilingSubmissionRoute, saveFilingSubmissionHandler);
app.openapi(deleteFilingSubmissionRoute, deleteFilingSubmissionHandler);
app.openapi(attachFilingReceiptRoute, attachFilingReceiptHandler);
app.openapi(getFilingReceiptContentRoute, getFilingReceiptContentHandler);

export default app;
