/**
 * createFilingSnapshot.ts — 確定スナップショット追加ユースケース（usecases）。DB必須。
 *
 * 「控除・計算」を確定する操作と対で呼ばれ、その時点の計算結果を
 * 履歴として1件追加する。差し戻しでは消さない（比較の材料として残す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import {
  filingSnapshotToApi,
  insertFilingSnapshotRow,
} from "../repositories/filingSnapshotRepository";
import { ErrorSchema } from "../schemas/common";
import {
  CreateFilingSnapshotRequestSchema,
  FilingSnapshotSchema,
  FilingSnapshotYearParamSchema,
} from "../schemas/filingSnapshot";

export const createFilingSnapshotRoute = createRoute({
  method: "post",
  path: "/api/filing-snapshots/{year}",
  operationId: "createFilingSnapshot",
  tags: ["FilingSnapshot"],
  summary: "確定スナップショットを追加（DB必須）",
  request: {
    params: FilingSnapshotYearParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: CreateFilingSnapshotRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FilingSnapshotSchema } },
      description: "追加された確定スナップショット",
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

export const createFilingSnapshotHandler: RouteHandler<
  typeof createFilingSnapshotRoute
> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const body = c.req.valid("json");
  const row = await insertFilingSnapshotRow(db, year, body.figures);
  return c.json(filingSnapshotToApi(row), 200);
};
