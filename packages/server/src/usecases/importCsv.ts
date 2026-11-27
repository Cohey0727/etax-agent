/**
 * importCsv.ts — CSV取込ユースケース（usecases）。
 *
 * リクエストは生バイト（text/csv 等）または JSON（content / contentBase64）の
 * 2形式を受けるため、ルート定義にボディスキーマは置かず、ハンドラで
 * 読み取る。取込の本体は services/csvImport/importCsvText（MCP と共用）。
 * DBがあれば取込履歴と取引を保存し、無ければプレビューとして返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { getDb } from "../lib/db";
import { errorMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { ErrorSchema } from "../schemas/common";
import {
  ImportCsvMappingError,
  ImportCsvMappingErrorSchema,
  ImportCsvResponseSchema,
} from "../schemas/importCsv";
import { decodeCsvBase64, decodeCsvBytes } from "../services/csvImport/csvDecoding";
import { CsvMappingParseError, importCsvText } from "../services/csvImport/importCsvText";

export const importCsvRoute = createRoute({
  method: "post",
  path: "/api/import/csv",
  operationId: "importCsv",
  tags: ["Imports"],
  summary: "CSV取込（AI/ヒューリスティクス自動マッピング）",
  responses: {
    200: {
      content: { "application/json": { schema: ImportCsvResponseSchema } },
      description: "取込結果（DBが無ければプレビュー）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストまたはCSVが不正",
    },
    422: {
      content: { "application/json": { schema: ImportCsvMappingErrorSchema } },
      description: "マッピングは決まったがパースに失敗",
    },
  },
});

export const importCsvHandler: RouteHandler<typeof importCsvRoute> = async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let filename = "upload.csv";
  let sourceName = "";
  let decoded: { text: string; encoding: string };

  try {
    if (contentType.includes("application/json")) {
      const body = await readJsonBody(c);
      if (!body) return c.json({ error: "JSONボディが不正です" }, 400);
      if (typeof body["filename"] === "string") filename = body["filename"] as string;
      if (typeof body["sourceName"] === "string") sourceName = body["sourceName"] as string;
      if (typeof body["contentBase64"] === "string") {
        decoded = decodeCsvBase64(body["contentBase64"] as string);
      } else if (typeof body["content"] === "string") {
        decoded = { text: body["content"] as string, encoding: "utf-8" };
      } else {
        return c.json({ error: "content（CSV文字列）または contentBase64 が必要です" }, 400);
      }
    } else {
      // 生バイト（text/csv 等）: Shift_JIS の可能性があるのでバイト列のまま受けてデコードする
      const buf = await c.req.arrayBuffer();
      const headerName = c.req.header("x-filename");
      if (headerName) {
        try {
          filename = decodeURIComponent(headerName);
        } catch {
          filename = headerName;
        }
      }
      decoded = decodeCsvBytes(new Uint8Array(buf));
    }
  } catch (e) {
    return c.json({ error: `リクエストの読み取りに失敗しました: ${errorMessage(e)}` }, 400);
  }

  try {
    const response = await importCsvText(getDb(), { ...decoded, filename, sourceName });
    return c.json(response, 200);
  } catch (e) {
    if (e instanceof CsvMappingParseError) {
      const response: ImportCsvMappingError = {
        error: e.message,
        mapping: e.mapping,
        mappingSource: e.mappingSource,
      };
      return c.json(response, 422);
    }
    throw e;
  }
};
