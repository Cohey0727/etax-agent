import { buildLedgerCsv } from "@etax/shared";
import { LedgerTransaction } from "@types";

/**
 * ledgerCsv.ts — 帳簿の表示中取引を CSV でダウンロードする（中身は @etax/shared の buildLedgerCsv）。
 */
export function downloadLedgerCsv(rows: LedgerTransaction[], label: string): void {
  const blob = new Blob([buildLedgerCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ledger-${label}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
