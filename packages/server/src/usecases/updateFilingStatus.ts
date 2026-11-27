/**
 * updateFilingStatus.ts — 申告ステータス更新ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 をボディ不正の 400 より
 * 先に返すため（ルート定義にボディは置かない）。
 * 指定された状態だけを更新する（部分更新）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  FilingStatusPatch,
  filingStatusToApi,
  upsertFilingStatusRow,
} from "../repositories/filingStatusRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FilingStatusYearParamSchema,
  SingleFilingStatusResponse,
  SingleFilingStatusResponseSchema,
  UpdateFilingStatusRequestSchema,
} from "../schemas/filingStatus";

export const updateFilingStatusRoute = createRoute({
  method: "put",
  path: "/api/filing-status/{year}",
  operationId: "updateFilingStatus",
  tags: ["FilingStatus"],
  summary: "申告ステータスを更新（DB必須）",
  request: { params: FilingStatusYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleFilingStatusResponseSchema } },
      description: "更新された申告ステータス",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year またはボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const updateFilingStatusHandler: RouteHandler<typeof updateFilingStatusRoute> = async (
  c,
) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateFilingStatusRequestSchema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const patch: FilingStatusPatch = {};
  if (parsed.data.confirmed !== undefined) patch.confirmed = parsed.data.confirmed;
  if (parsed.data.calculated !== undefined) patch.calculated = parsed.data.calculated;
  if (parsed.data.submitted !== undefined) patch.submitted = parsed.data.submitted;
  const row = await upsertFilingStatusRow(db, year, patch);
  if (!row) throw new HTTPException(503, { message: "申告ステータスを保存できませんでした" });
  const response: SingleFilingStatusResponse = { status: filingStatusToApi(row) };
  return c.json(response, 200);
};
