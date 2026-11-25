import { LedgerTransaction } from "@types";
import { INCOME_TYPE_OPTIONS } from "./ledgerOptions";

/**
 * ledgerCsv.ts — 帳簿の表示中取引を CSV でダウンロードする。
 */

const CSV_HEADER: readonly string[] = [
  "日付",
  "年度",
  "摘要",
  "金額",
  "勘定科目",
  "区分",
  "税区分",
  "出所",
];

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** 表示中の取引をCSVでダウンロードする。Excelで開けるようBOMを付ける。 */
export function downloadLedgerCsv(rows: LedgerTransaction[], label: string): void {
  const lines = rows.map((row) =>
    [
      row.date,
      row.fiscal_year,
      row.description,
      row.amount,
      row.category,
      INCOME_TYPE_OPTIONS.find((option) => option.value === row.income_type)?.label ??
        row.income_type,
      row.tax_category,
      row.account,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["\uFEFF" + [CSV_HEADER.join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ledger-${label}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
