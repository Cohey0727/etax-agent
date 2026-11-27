/**
 * csvParsing.ts — 列マッピングを使ったCSV行のパース（services/csvImport）。
 *
 * 日付・金額を正規化し、内部形式の取引にする。勘定科目・収入区分の分類は
 * shared の classifyTransactionRow が正本（明示列の値が推定より優先される）。
 * ファイル内の同一行はここでは落とさない（同日・同額の正当な別取引が
 * あり得るため）。重複の除外は DB との多重集合突合（importDedupe）が担う。
 */
import { classifyTransactionRow, Transaction } from "@etax/shared";
import { CsvMapping } from "../../schemas/importCsv";
import { parseAmountCell, parseDateCell } from "./csvCellParsing";

export interface ParseResult {
  transactions: Transaction[];
  /** 日付や金額が読めず読み飛ばした行数 */
  skippedRows: number;
  /** データ行の総数（ヘッダー除く） */
  totalRows: number;
}

/** マッピングで全行をパースし、内部形式の取引リストにする。 */
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
  let skippedRows = 0;

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
      // 入金 − 出金。出金列と入金列が両方ある形式では各列が金額の大きさを
      // 表す（出金を負数で印字する銀行もある）ため絶対値で合成する。出金列
      // だけの形式（カードの利用金額など）では負数が返品・返金を表すので
      // 符号をそのまま使う。
      amount = iDebit >= 0 && iCredit >= 0
        ? Math.abs(c ?? 0) - Math.abs(d ?? 0)
        : (c ?? 0) - (d ?? 0);
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
    // ファイル内の同一行も落とさない。同日・同額・同摘要の正当な別取引
    // （例: PayPay のギフトカードチャージの連続実行）があり得るためで、
    // 再取込時の重複は DB との多重集合突合（importDedupe）が防ぐ。
    transactions.push(tx);
  }
  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { transactions, skippedRows, totalRows: dataRows.length };
}
