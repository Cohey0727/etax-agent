/**
 * files.ts — ファイル系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import { presignUploadFileHandler, presignUploadFileRoute } from "../usecases/presignUploadFile";
import { uploadFileContentHandler } from "../usecases/uploadFileContent";

const app = new OpenAPIHono();
app.openapi(
  presignUploadFileRoute,
  presignUploadFileHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
// アップロード実体の受け口（バイナリPUT。OpenAPI対象外の通常ルート）。
app.put("/api/files/content/*", uploadFileContentHandler);

export default app;
