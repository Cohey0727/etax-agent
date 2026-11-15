/**
 * csvParsing.ts — 列マッピングを使ったCSV行のパース（services/csvImport）。
 *
 * 日付・金額を正規化し、内部形式の取引にする。勘定科目・収入区分の分類は
 * shared の classifyTransactionRow が正本（明示列の値が推定より優先される）。
 * 完全重複行は除外する。
 */
import { classifyTransactionRow, parseCsv, Transaction } from "@etax/shared";
import { CsvMapping } from "../../schemas/importCsv";
import { parseAmountCell, parseDateCell } from "./csvCellParsing";

export interface ParseResult {
  transactions: Transaction[];
  /** 日付や金額が読めず読み飛ばした行数 */
  skippedRows: number;
  /** 完全重複として除外した行数 */
  duplicatesSkipped: number;
  /** データ行の総数（ヘッダー除く） */
  totalRows: number;
}

/** マッピングで全行をパースし、内部形式の取引リストにする。完全重複行は除外する。 */
export function parseWithMapping(
  rows: string[][],
  mapping: CsvMapping,
  sourceName: string,
): ParseResult {
  if (rows.length === 0) throw new Error("CSVが空です");
  const headers = (rows[0] as string[]).map((h) => h.trim());
  const dataRows = rows.slice(1);
  const idxOf = (colName: string | null): number => (colName ? headers.indexOf(colName) : -1);
  const iDate = idxOf(mapping.dateColumn);
  const iDesc = idxOf(mapping.descriptionColumn);
  const iAmount = idxOf(mapping.amountColumn);
  const iDebit = idxOf(mapping.debitColumn);
  const iCredit = idxOf(mapping.creditColumn);
  const iAccount = idxOf(mapping.accountColumn);
  const iCategory = idxOf(mapping.categoryColumn);
  const iIncomeType = idxOf(mapping.incomeTypeColumn);
  const iTaxCategory = idxOf(mapping.taxCategoryColumn);

  if (iDate < 0) throw new Error("日付列が特定できませんでした（マッピング失敗）");
  if (iAmount < 0 && iDebit < 0 && iCredit < 0) {
    throw new Error("金額列が特定できませんでした（マッピング失敗）");
  }

  const cell = (row: string[], i: number): string => (i >= 0 ? (row[i] ?? "") : "");
  const transactions: Transaction[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;
  let duplicatesSkipped = 0;

  for (const row of dataRows) {
    if (row.every((c) => c.trim() === "")) continue; // 完全な空行は数えない
    const date = parseDateCell(cell(row, iDate));
    if (!date) {
      skippedRows++;
      continue;
    }
    let amount: number;
    if (iDebit >= 0 || iCredit >= 0) {
      const dRaw = cell(row, iDebit);
      const cRaw = cell(row, iCredit);
      const d = parseAmountCell(dRaw);
      const c = parseAmountCell(cRaw);
      if (d === null && c === null) {
        skippedRows++;
        continue;
      }
      amount = (c ?? 0) - (d ?? 0); // 入金 − 出金
    } else {
      const n = parseAmountCell(cell(row, iAmount));
      if (n === null) {
        skippedRows++;
        continue;
      }
      amount = mapping.amountSign === "inverted" ? -n : n;
    }
    const description = cell(row, iDesc).trim();
    const account = (iAccount >= 0 ? cell(row, iAccount).trim() : "") || sourceName;
    // 分類は shared の正本に委ねる。明示列が無い項目は null を渡し、推定に委ねる
    const { category, income_type } = classifyTransactionRow({
      description,
      category: iCategory >= 0 ? cell(row, iCategory) : null,
      incomeType: iIncomeType >= 0 ? cell(row, iIncomeType) : null,
    });
    const tx: Transaction = {
      date,
      year: Number(date.slice(0, 4)),
      description,
      amount,
      account,
      category,
      income_type,
      tax_category: cell(row, iTaxCategory).trim(),
    };
    const key = `${tx.date}|${tx.amount}|${tx.description}|${tx.account}`;
    if (seen.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(key);
    transactions.push(tx);
  }
  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { transactions, skippedRows, duplicatesSkipped, totalRows: dataRows.length };
}

/** デコード済みテキストから (ヘッダー, データ行) を取り出す。 */
export function splitHeader(text: string): { headers: string[]; dataRows: string[][] } {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSVが空です");
  const headers = (rows[0] as string[]).map((h) => h.trim());
  return { headers, dataRows: rows.slice(1) };
}
