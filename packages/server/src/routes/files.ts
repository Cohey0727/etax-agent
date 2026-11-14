/**
 * files.ts — ファイル系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import { presignUploadFileHandler, presignUploadFileRoute } from "../usecases/presignUploadFile";

const app = new OpenAPIHono();
app.openapi(
  presignUploadFileRoute,
  presignUploadFileHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);

export default app;
