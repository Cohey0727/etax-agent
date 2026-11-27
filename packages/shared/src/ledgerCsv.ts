/**
 * ledgerCsv.ts — 帳簿画面の収入区分の表示名と、表示中の取引の CSV 書き出し。
 * Web と native の帳簿画面が共有する。取引は API のワイヤ形式（snake_case）。
 */
import { IncomeType } from "./types";

/** 帳簿画面の収入区分の表示名（その他区分は申告の対象外なので「対象外」）。並びは選択肢の順。 */
export const LEDGER_INCOME_TYPE_LABELS = {
  business: "事業",
  real_estate: "不動産",
  other: "対象外",
} as const satisfies Record<IncomeType, string>;

/** 収入区分の表示名。帳簿に未知の値が入っていればその値をそのまま返す。 */
export function ledgerIncomeTypeLabel(value: string): string {
  return Object.prototype.hasOwnProperty.call(LEDGER_INCOME_TYPE_LABELS, value)
    ? LEDGER_INCOME_TYPE_LABELS[value as IncomeType]
    : value;
}

/** CSV に書き出す取引の項目。 */
export interface LedgerCsvRow {
  date: string;
  fiscal_year: number;
  description: string;
  amount: number;
  category: string;
  income_type: string;
  tax_category: string;
  account: string;
}

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

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** 表示中の取引を CSV の文字列にする。Excel で開けるよう BOM を付け、改行は CRLF。 */
export function buildLedgerCsv(rows: readonly LedgerCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      row.date,
      row.fiscal_year,
      row.description,
      row.amount,
      row.category,
      ledgerIncomeTypeLabel(row.income_type),
      row.tax_category,
      row.account,
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [CSV_HEADER.join(","), ...lines].join("\r\n");
}
