/**
 * mcpImportTools.ts — MCP の CSV 取込系ツール（services/mcp）。
 *
 * REST の /api/import/csv・/api/imports と同じ取込の本体（services/csvImport/
 * importCsvText）とリポジトリを使う。CSV は文字列または Base64（Shift_JIS 等の
 * バイト列はこちら）で受ける。
 */
import { importToApi, listImportRows } from "../../repositories/importRepository";
import { decodeCsvBase64 } from "../csvImport/csvDecoding";
import { CsvMappingParseError, importCsvText } from "../csvImport/importCsvText";
import { McpToolModule, requireDb, textResult } from "./mcpToolKit";

export const mcpImportTools: McpToolModule = {
  tools: [
    {
      name: "import_csv",
      description:
        "CSV を帳簿へ取り込む。列マッピングは自動判定（AI→ヒューリスティクス）、既に取り込み済みの取引は指紋で重複除外される。CSV は content（文字列）か content_base64（Shift_JIS 等のバイト列を Base64 化したもの）で渡す。",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "CSV 文字列（UTF-8 の場合）" },
          content_base64: {
            type: "string",
            description: "CSV バイト列の Base64（Shift_JIS 等はこちら）",
          },
          filename: { type: "string", description: "ファイル名（任意、既定 upload.csv）" },
          source_name: {
            type: "string",
            description: "取込元の表示名（任意、既定はファイル名から生成）",
          },
        },
      },
    },
    {
      name: "list_imports",
      description: "CSV 取込履歴の一覧を返す。",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  handlers: {
    import_csv: async (args) => {
      const db = requireDb();
      const filename =
        typeof args["filename"] === "string" && args["filename"] !== "" ? args["filename"] : "upload.csv";
      const sourceName = typeof args["source_name"] === "string" ? args["source_name"] : "";
      let decoded: { text: string; encoding: string };
      if (typeof args["content_base64"] === "string") {
        decoded = decodeCsvBase64(args["content_base64"]);
      } else if (typeof args["content"] === "string") {
        decoded = { text: args["content"], encoding: "utf-8" };
      } else {
        throw new Error("content（CSV文字列）または content_base64 が必要です");
      }
      try {
        return textResult(await importCsvText(db, { ...decoded, filename, sourceName }));
      } catch (e) {
        if (e instanceof CsvMappingParseError) {
          throw new Error(
            `マッピングは決まりましたがパースに失敗しました: ${e.message}（mapping=${JSON.stringify(e.mapping)}, mappingSource=${e.mappingSource}）`,
          );
        }
        throw e;
      }
    },
    list_imports: async () => {
      const db = requireDb();
      const rows = await listImportRows(db);
      return textResult({ count: rows.length, imports: rows.map(importToApi) });
    },
  },
};
