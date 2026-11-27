/**
 * listFilingSnapshots.ts — 確定スナップショット一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  filingSnapshotToApi,
  listFilingSnapshotRows,
} from "../repositories/filingSnapshotRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FilingSnapshotYearParamSchema,
  ListFilingSnapshotsResponse,
  ListFilingSnapshotsResponseSchema,
} from "../schemas/filingSnapshot";

export const listFilingSnapshotsRoute = createRoute({
  method: "get",
  path: "/api/filing-snapshots/{year}",
  operationId: "listFilingSnapshots",
  tags: ["FilingSnapshot"],
  summary: "確定スナップショット一覧を取得（DB必須）",
  request: { params: FilingSnapshotYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListFilingSnapshotsResponseSchema } },
      description: "確定スナップショット一覧（確定日時の昇順）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listFilingSnapshotsHandler: RouteHandler<
  typeof listFilingSnapshotsRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { year } = c.req.valid("param");
  let rows;
  try {
    rows = await listFilingSnapshotRows(db, year);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListFilingSnapshotsResponse = {
    snapshots: rows.map(filingSnapshotToApi),
  };
  return c.json(response, 200);
};
