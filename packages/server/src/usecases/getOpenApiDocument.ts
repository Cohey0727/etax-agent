/**
 * getOpenApiDocument.ts — OpenAPI ドキュメントの公開（usecases）。
 *
 * 全ルートは @hono/zod-openapi の createRoute で定義され、ルート集約時に
 * ルートアプリのレジストリへ統合される。そのレジストリから生成した
 * スペックを GET /openapi.json で返す（「全 API = OpenAPI = MCP」の
 * OpenAPI 側の公開口）。スキーマ定義そのものが正本で、ここは写すだけ。
 * 認証は付けない: スペックは API の形だけを公開し、実データは含まない
 * （各 API の認証は従来どおり）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";

/** OpenAPI ドキュメントを公開するパス。 */
export const OPENAPI_DOCUMENT_PATH = "/openapi.json";

/**
 * ルートアプリからドキュメントを生成するハンドラを作る。
 * ドキュメント生成には集約済みアプリが要るため、組み立て側（index）が
 * 全ルート登録後にこのハンドラを載せる。
 */
export function createOpenApiDocumentHandler(app: OpenAPIHono) {
  return (c: Context) =>
    c.json(
      app.getOpenAPIDocument({
        openapi: "3.0.0",
        info: {
          title: "eTaxAgent API",
          version: "0.1.0",
          description:
            "eTaxAgent の REST API。全エンドポイントの正本はこのスペックで、" +
            "同じ操作は MCP（/mcp のツール）からも実行できる。",
        },
      }),
    );
}
