/**
 * importCsv.ts — CSV取込ユースケース（usecases）。
 *
 * リクエストは生バイト（text/csv 等）または JSON（content / contentBase64）の
 * 2形式を受けるため、ルート定義にボディスキーマは置かず、ハンドラで
 * 読み取る。列マッピングは自動判定（services/csvImport）。
 * DBがあれば取込履歴と取引を保存し、無ければプレビューとして返す。
 */
import { parseCsv } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { getDb } from "../lib/db";
import { errorMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { createImportWithTransactions } from "../repositories/importRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ImportCsvMappingError,
  ImportCsvMappingErrorSchema,
  ImportCsvResponse,
  ImportCsvResponseSchema,
} from "../schemas/importCsv";
import { listTransactionFingerprintRows } from "../repositories/transactionRepository";
import { decodeCsvBytes } from "../services/csvImport/csvDecoding";
import { excludeImportedTransactions } from "../services/csvImport/importDedupe";
import { resolveMapping } from "../services/csvImport/csvMapping";
import { ParseResult, parseWithMapping } from "../services/csvImport/csvParsing";

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
  let text: string;
  let encoding = "utf-8";

  try {
    if (contentType.includes("application/json")) {
      const body = await readJsonBody(c);
      if (!body) return c.json({ error: "JSONボディが不正です" }, 400);
      if (typeof body["filename"] === "string") filename = body["filename"] as string;
      if (typeof body["sourceName"] === "string") sourceName = body["sourceName"] as string;
      if (typeof body["contentBase64"] === "string") {
        const bin = atob(body["contentBase64"] as string);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const decoded = decodeCsvBytes(bytes);
        text = decoded.text;
        encoding = decoded.encoding;
      } else if (typeof body["content"] === "string") {
        text = body["content"] as string;
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
      const decoded = decodeCsvBytes(new Uint8Array(buf));
      text = decoded.text;
      encoding = decoded.encoding;
    }
  } catch (e) {
    return c.json({ error: `リクエストの読み取りに失敗しました: ${errorMessage(e)}` }, 400);
  }

  if (!sourceName) sourceName = filename.replace(/\.[^.]+$/, "") || "CSV取込";

  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return c.json({ error: `CSVのパースに失敗しました: ${errorMessage(e)}` }, 400);
  }
  if (rows.length === 0) return c.json({ error: "CSVが空です" }, 400);
  const headers = (rows[0] as string[]).map((h) => h.trim());
  const dataRows = rows.slice(1);

  // 列マッピングは自動（AI → 失敗/キー無しならヒューリスティクス）
  const { mapping, source } = await resolveMapping(headers, dataRows);

  let parsed: ParseResult;
  try {
    parsed = parseWithMapping(rows, mapping, sourceName);
  } catch (e) {
    const response: ImportCsvMappingError = { error: errorMessage(e), mapping, mappingSource: source };
    return c.json(response, 422);
  }

  // DBがあれば永続化する。無ければプレビューとして返す（取込自体は成立）。
  // 永続化の前に、既にDBにある取引と指紋で突き合わせて重複分を除く。
  // これで同じCSVを何回取り込んでも二重計上されない（件数ベースの
  // 突き合わせなので、同日・同額・同名の別取引が複数ある場合も壊れない）。
  let persisted = false;
  let importId: number | undefined;
  let persistWarning: string | undefined;
  let effectiveTransactions = parsed.transactions;
  let alreadyImported = 0;
  const db = getDb();
  if (db) {
    try {
      const existing = await listTransactionFingerprintRows(db);
      const deduped = excludeImportedTransactions(parsed.transactions, existing, mapping);
      importId = await createImportWithTransactions(db, {
        filename,
        sourceName,
        mapping,
        transactions: deduped.fresh,
      });
      effectiveTransactions = deduped.fresh;
      alreadyImported = deduped.duplicates;
      persisted = true;
    } catch (e) {
      // 例外の文面には SQL 文とバインド値が入るので、応答には載せずログにだけ残す。
      console.error("CSV取込の保存に失敗しました:", e);
      persistWarning = "DBへの保存に失敗しました（プレビューとして返します）";
    }
  }

  const response: ImportCsvResponse = {
    mapping,
    mappingSource: source,
    encoding,
    filename,
    count: effectiveTransactions.length,
    totalRows: parsed.totalRows,
    skippedRows: parsed.skippedRows,
    duplicatesSkipped: parsed.duplicatesSkipped + alreadyImported,
    persisted,
    importId: importId ?? null,
    persistWarning: persistWarning ?? null,
    transactions: effectiveTransactions.slice(0, 500),
  };
  return c.json(response, 200);
};
