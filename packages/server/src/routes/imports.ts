/**
 * imports.ts — 取込系ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { importCsvHandler, importCsvRoute } from "../usecases/importCsv";
import { listImportsHandler, listImportsRoute } from "../usecases/listImports";

const app = new OpenAPIHono();
app.openapi(listImportsRoute, listImportsHandler);
app.openapi(importCsvRoute, importCsvHandler);

export default app;
