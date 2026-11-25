/**
 * historyTimelineEntries.test.ts — 履歴APIの応答（スナップショット付き）
 * からタイムライン表示データへの変換の検証。
 *
 * 担保すること:
 * - 取引の登録・訂正・削除が、要約と項目差分を持つ表示データになること
 * - 削除は項目が同一でも「削除日時」の差分として表れること
 * - 提出の記録の訂正が受付番号の差分として表れること
 */
import { describe, expect, test } from "bun:test";
import { toTransactionTimelineEntry } from "../src/components/organisms/ledger/TransactionHistoryDrawer/transactionHistoryFields";
import { toSubmissionTimelineEntry } from "../src/components/organisms/filing/SubmissionHistoryDrawer/submissionHistoryFields";
import {
  FilingSubmission,
  LedgerTransactionSnapshot,
  TransactionHistoryEntry,
} from "../src/types";

const snapshot: LedgerTransactionSnapshot = {
  id: 7,
  date: "2026-02-01",
  fiscal_year: 2026,
  description: "AWS 利用料",
  amount: -5500,
  account: "事業口座",
  category: "通信費",
  income_type: "business",
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
};

describe("取引履歴の表示変換", () => {
  test("登録は要約と全項目の差分になる", () => {
    const entry: TransactionHistoryEntry = {
      id: 1,
      transaction_id: 7,
      action: "created",
      before: null,
      after: snapshot,
      created_at: "2026-02-01T01:00:00.000Z",
    };
    const timeline = toTransactionTimelineEntry(entry);
    expect(timeline.actionLabel).toBe("登録");
    expect(timeline.summary).toBe("2026-02-01 AWS 利用料 -5,500円");
    expect(timeline.changes).toContainEqual({
      label: "金額",
      before: "―",
      after: "-5,500円",
    });
    expect(timeline.changes.some((c) => c.label === "削除日時")).toBe(false);
  });

  test("訂正は変わった項目だけが差分になる", () => {
    const entry: TransactionHistoryEntry = {
      id: 2,
      transaction_id: 7,
      action: "updated",
      before: snapshot,
      after: { ...snapshot, amount: -6600 },
      created_at: "2026-02-02T01:00:00.000Z",
    };
    const timeline = toTransactionTimelineEntry(entry);
    expect(timeline.actionLabel).toBe("訂正");
    expect(timeline.changes).toEqual([
      { label: "金額", before: "-5,500円", after: "-6,600円" },
    ]);
  });

  test("削除は削除日時の差分として表れる", () => {
    const entry: TransactionHistoryEntry = {
      id: 3,
      transaction_id: 7,
      action: "deleted",
      before: snapshot,
      after: { ...snapshot, deleted_at: "2026-02-03T01:00:00.000Z" },
      created_at: "2026-02-03T01:00:00.000Z",
    };
    const timeline = toTransactionTimelineEntry(entry);
    expect(timeline.actionLabel).toBe("削除");
    expect(timeline.changes.length).toBe(1);
    expect(timeline.changes[0].label).toBe("削除日時");
    expect(timeline.changes[0].before).toBe("―");
  });
});

const submission: FilingSubmission = {
  year: 2026,
  kind: "income",
  acceptance_number: "202602150001",
  submitted_date: "2026-02-15",
  receipt: null,
  updated_at: "2026-02-15T00:00:00.000Z",
};

describe("提出の記録の履歴の表示変換", () => {
  test("訂正は受付番号の差分になる", () => {
    const timeline = toSubmissionTimelineEntry({
      id: 1,
      year: 2026,
      kind: "income",
      action: "updated",
      before: submission,
      after: { ...submission, acceptance_number: "202602150002" },
      created_at: "2026-02-16T01:00:00.000Z",
    });
    expect(timeline.actionLabel).toBe("訂正");
    expect(timeline.summary).toBe("受付番号: 202602150002");
    expect(timeline.changes).toEqual([
      { label: "受付番号", before: "202602150001", after: "202602150002" },
    ]);
  });

  test("受信通知PDFの添付は差分になる", () => {
    const timeline = toSubmissionTimelineEntry({
      id: 2,
      year: 2026,
      kind: "income",
      action: "updated",
      before: submission,
      after: {
        ...submission,
        receipt: { file_id: "file-1", mime_type: "application/pdf" },
      },
      created_at: "2026-02-16T02:00:00.000Z",
    });
    expect(timeline.changes).toEqual([
      { label: "受信通知PDF", before: "なし", after: "添付あり" },
    ]);
  });
});
