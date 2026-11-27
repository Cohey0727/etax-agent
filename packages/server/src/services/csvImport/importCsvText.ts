/**
 * importCsvText.ts — CSV 取込の本体（services/csvImport）。
 *
 * 取込画面（REST の /api/import/csv）と MCP の import_csv が共用する。
 * パース → 列マッピングの自動判定（AI → ヒューリスティクス）→ 内部形式への変換 →
 * 既存の取引との指紋の突き合わせ（重複除外）→ 取込履歴と取引の保存、の順に処理する。
 * DB が無い、または保存に失敗した場合は、取込の結果をプレビューとして返す。
 */
import { parseCsv } from "@etax/shared";
import { Db } from "../../lib/db";
import { BusinessError, errorMessage } from "../../lib/errors";
import { createImportWithTransactions } from "../../repositories/importRepository";
import { listTransactionFingerprintRows } from "../../repositories/transactionRepository";
import { CsvMapping, ImportCsvResponse, MappingSource } from "../../schemas/importCsv";
import { resolveMapping } from "./csvMapping";
import { ParseResult, parseWithMapping } from "./csvParsing";
import { excludeImportedTransactions } from "./importDedupe";

/** CSV として読めない・空など、取込の入力の不備（400）。 */
export class CsvImportError extends BusinessError {}

/** 列マッピングは決まったが、そのマッピングで行を読めなかったことを表す例外。 */
export class CsvMappingParseError extends Error {
  constructor(
    message: string,
    readonly mapping: CsvMapping,
    readonly mappingSource: MappingSource,
  ) {
    super(message);
    this.name = "CsvMappingParseError";
  }
}

export interface CsvImportInput {
  /** デコード済みの CSV テキスト。 */
  text: string;
  /** デコードに使った文字コード（応答に含める）。 */
  encoding: string;
  filename: string;
  /** 取込元の表示名。空ならファイル名から作る。 */
  sourceName: string;
}

/** 応答に含める取込結果の取引の上限件数（全件は帳簿から読める）。 */
const MAX_RESPONSE_TRANSACTIONS = 500;

/** CSV テキストを取り込む。db が null ならプレビューとして返す。 */
export async function importCsvText(db: Db | null, input: CsvImportInput): Promise<ImportCsvResponse> {
  const sourceName = input.sourceName || input.filename.replace(/\.[^.]+$/, "") || "CSV取込";
  let rows: string[][];
  try {
    rows = parseCsv(input.text);
  } catch (e) {
    throw new CsvImportError(400, `CSVのパースに失敗しました: ${errorMessage(e)}`);
  }
  if (rows.length === 0) throw new CsvImportError(400, "CSVが空です");
  const headers = (rows[0] as string[]).map((h) => h.trim());
  const { mapping, source } = await resolveMapping(headers, rows.slice(1));

  let parsed: ParseResult;
  try {
    parsed = parseWithMapping(rows, mapping, sourceName);
  } catch (e) {
    throw new CsvMappingParseError(errorMessage(e), mapping, source);
  }

  // 既に DB にある取引と指紋で突き合わせて重複分を除いてから保存する。同じ CSV を
  // 何回取り込んでも二重計上されない（件数ベースの突き合わせなので、同日・同額・
  // 同名の別取引が複数ある場合も壊れない）。
  let persisted = false;
  let importId: number | null = null;
  let persistWarning: string | null = null;
  let transactions = parsed.transactions;
  let duplicatesSkipped = 0;
  if (db) {
    try {
      const existing = await listTransactionFingerprintRows(db);
      const deduped = excludeImportedTransactions(parsed.transactions, existing, mapping);
      importId =
        (await createImportWithTransactions(db, {
          filename: input.filename,
          sourceName,
          mapping,
          transactions: deduped.fresh,
        })) ?? null;
      transactions = deduped.fresh;
      duplicatesSkipped = deduped.duplicates;
      persisted = true;
    } catch (e) {
      // 例外の文面には SQL 文とバインド値が入るので、応答には載せずログにだけ残す。
      console.error("CSV取込の保存に失敗しました:", e);
      persistWarning = "DBへの保存に失敗しました（プレビューとして返します）";
    }
  }

  return {
    mapping,
    mappingSource: source,
    encoding: input.encoding,
    filename: input.filename,
    count: transactions.length,
    totalRows: parsed.totalRows,
    skippedRows: parsed.skippedRows,
    duplicatesSkipped,
    persisted,
    importId,
    persistWarning,
    transactions: transactions.slice(0, MAX_RESPONSE_TRANSACTIONS),
  };
}
