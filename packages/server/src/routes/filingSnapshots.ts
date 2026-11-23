/**
 * filingSnapshots.ts — 確定スナップショットルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createFilingSnapshotHandler,
  createFilingSnapshotRoute,
} from "../usecases/createFilingSnapshot";
import {
  listFilingSnapshotsHandler,
  listFilingSnapshotsRoute,
} from "../usecases/listFilingSnapshots";

const app = new OpenAPIHono();
app.openapi(listFilingSnapshotsRoute, listFilingSnapshotsHandler);
app.openapi(createFilingSnapshotRoute, createFilingSnapshotHandler);

export default app;
