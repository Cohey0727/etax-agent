/**
 * mcpImportTools.ts — MCP の CSV 取込系ツール（services/mcp）。
 *
 * REST の /api/import/csv・/api/imports と同じ取込パイプライン
 * （services/csvImport）とリポジトリを使う。CSV は文字列または
 * Base64（Shift_JIS 等のバイト列はこちら）で受け、列マッピングは
 * REST と同じ自動判定、重複は指紋で除外してから保存する。
 */
import { parseCsv } from "@etax/shared";
import { errorMessage } from "../../lib/errors";
import {
  createImportWithTransactions,
  importToApi,
  listImportRows,
} from "../../repositories/importRepository";
import { listTransactionFingerprintRows } from "../../repositories/transactionRepository";
import { decodeCsvBytes } from "../csvImport/csvDecoding";
import {
  buildFingerprintCounts,
  excludeAlreadyImported,
  transactionFingerprint,
} from "../csvImport/importDedupe";
import { resolveMapping } from "../csvImport/csvMapping";
import { parseWithMapping } from "../csvImport/csvParsing";
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
      let filename = "upload.csv";
      if (typeof args["filename"] === "string" && args["filename"] !== "") {
        filename = args["filename"];
      }
      let sourceName = "";
      if (typeof args["source_name"] === "string") sourceName = args["source_name"];

      let text: string;
      let encoding = "utf-8";
      if (typeof args["content_base64"] === "string") {
        const bin = atob(args["content_base64"]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const decoded = decodeCsvBytes(bytes);
        text = decoded.text;
        encoding = decoded.encoding;
      } else if (typeof args["content"] === "string") {
        text = args["content"];
      } else {
        throw new Error("content（CSV文字列）または content_base64 が必要です");
      }
      if (!sourceName) sourceName = filename.replace(/\.[^.]+$/, "") || "CSV取込";

      let rows: string[][];
      try {
        rows = parseCsv(text);
      } catch (e) {
        throw new Error(`CSVのパースに失敗しました: ${errorMessage(e)}`);
      }
      if (rows.length === 0) throw new Error("CSVが空です");
      const headers = (rows[0] as string[]).map((h) => h.trim());
      const dataRows = rows.slice(1);

      const { mapping, source } = await resolveMapping(headers, dataRows);
      let parsed;
      try {
        parsed = parseWithMapping(rows, mapping, sourceName);
      } catch (e) {
        throw new Error(
          `マッピングは決まりましたがパースに失敗しました: ${errorMessage(e)}（mapping=${JSON.stringify(mapping)}, mappingSource=${source}）`,
        );
      }

      const existing = await listTransactionFingerprintRows(db);
      const deduped = excludeAlreadyImported(
        parsed.transactions,
        (t) =>
          transactionFingerprint({
            date: t.date,
            amount: t.amount,
            description: t.description,
            account: t.account,
            taxCategory: t.tax_category,
          }),
        buildFingerprintCounts(existing),
      );
      const importId = await createImportWithTransactions(db, {
        filename,
        sourceName,
        mapping,
        transactions: deduped.fresh,
      });

      return textResult({
        mapping,
        mappingSource: source,
        encoding,
        filename,
        count: deduped.fresh.length,
        totalRows: parsed.totalRows,
        skippedRows: parsed.skippedRows,
        duplicatesSkipped: parsed.duplicatesSkipped + deduped.duplicates,
        persisted: true,
        importId,
        transactions: deduped.fresh.slice(0, 500),
      });
    },
    list_imports: async () => {
      const db = requireDb();
      const rows = await listImportRows(db);
      return textResult({ count: rows.length, imports: rows.map(importToApi) });
    },
  },
};
