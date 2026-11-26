import { LedgerTransaction } from "@/api";
import { INCOME_TYPE_OPTIONS } from "./options";

/** 帳簿CSVの列見出し。 */
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

/** 表示中の取引をCSV文字列にする。Excelで開けるようBOMを付ける。 */
export function buildLedgerCsv(rows: readonly LedgerTransaction[]): string {
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
  return "\uFEFF" + [CSV_HEADER.join(","), ...lines].join("\r\n");
}
