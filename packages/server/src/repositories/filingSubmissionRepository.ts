/**
 * filingSubmissionRepository.ts — 提出の記録（受付番号・受信通知PDF）への
 * データアクセス（repositories）。Issue #28 Phase 1。
 *
 * 変更はすべて filing_submission_history へ変更前後のスナップショットと
 * ともに記録する（電子帳簿保存法の訂正・削除履歴に相当する仕組みで、
 * 取引の transaction_history と同じ方式）。行 → API 形式への変換もここ。
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { Db, DbOrTx } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import {
  FilingSubmissionHistoryEntryResponse,
  FilingSubmissionKind,
  FilingSubmissionResponse,
} from "../schemas/filingSubmission";
import {
  FilingSubmissionHistoryRow,
  FilingSubmissionRow,
  filingSubmissionHistoryTable,
  filingSubmissionsTable,
} from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function filingSubmissionToApi(row: FilingSubmissionRow): FilingSubmissionResponse {
  return {
    year: row.year,
    kind: row.kind as FilingSubmissionKind,
    acceptance_number: row.acceptanceNumber,
    submitted_date: row.submittedDate,
    receipt: row.receiptFileId
      ? { file_id: row.receiptFileId, mime_type: row.receiptMimeType }
      : null,
    updated_at: row.updatedAt.toISOString(),
  };
}

/** 変更履歴の DB 行を API レスポンス形式に変換する。 */
export function filingSubmissionHistoryToApi(
  row: FilingSubmissionHistoryRow,
): FilingSubmissionHistoryEntryResponse {
  return {
    id: row.id,
    year: row.year,
    kind: row.kind as FilingSubmissionKind,
    action: row.action,
    before: (row.before as FilingSubmissionResponse | null) ?? null,
    after: (row.after as FilingSubmissionResponse | null) ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** 対象年の提出の記録の変更履歴を新しい順に取得する。 */
export async function listFilingSubmissionHistoryRows(
  db: DbOrTx,
  year: number,
): Promise<FilingSubmissionHistoryRow[]> {
  const owner = currentUserId();
  const conditions = [eq(filingSubmissionHistoryTable.year, year)];
  if (owner !== undefined) {
    conditions.push(eq(filingSubmissionHistoryTable.ownerUserId, owner));
  }
  return db
    .select()
    .from(filingSubmissionHistoryTable)
    .where(and(...conditions))
    .orderBy(desc(filingSubmissionHistoryTable.id));
}

/** 現在のテナントで対象（年度×税目）の行を引く条件。 */
function targetConditions(year: number, kind: FilingSubmissionKind) {
  const owner = currentUserId();
  const conditions = [
    eq(filingSubmissionsTable.year, year),
    eq(filingSubmissionsTable.kind, kind),
  ];
  if (owner !== undefined) conditions.push(eq(filingSubmissionsTable.ownerUserId, owner));
  return and(...conditions);
}

/** 対象（年度×税目）の提出記録を取得する。無ければ null。 */
export async function getFilingSubmissionRow(
  db: DbOrTx,
  year: number,
  kind: FilingSubmissionKind,
): Promise<FilingSubmissionRow | null> {
  const rows = await db
    .select()
    .from(filingSubmissionsTable)
    .where(targetConditions(year, kind));
  return rows[0] ?? null;
}

/** fileId で受信通知が添付された行を取得する（重複添付の検出用）。 */
export async function getFilingSubmissionRowByFileId(
  db: DbOrTx,
  fileId: string,
): Promise<FilingSubmissionRow | null> {
  const rows = await db
    .select()
    .from(filingSubmissionsTable)
    .where(eq(filingSubmissionsTable.receiptFileId, fileId));
  return rows[0] ?? null;
}

/** 対象年の提出記録を税目順で取得する。 */
export async function listFilingSubmissionRows(
  db: DbOrTx,
  year: number,
): Promise<FilingSubmissionRow[]> {
  const owner = currentUserId();
  const conditions = [eq(filingSubmissionsTable.year, year)];
  if (owner !== undefined) conditions.push(eq(filingSubmissionsTable.ownerUserId, owner));
  return db
    .select()
    .from(filingSubmissionsTable)
    .where(and(...conditions))
    .orderBy(asc(filingSubmissionsTable.kind));
}

export interface FilingSubmissionPatch {
  acceptanceNumber?: string;
  submittedDate?: string | null;
  receiptFileId?: string | null;
  receiptMimeType?: string;
}

/**
 * 提出記録を作成または部分更新し、変更履歴を1行残す。
 * patch で指定された項目だけを書き換える。
 */
export async function upsertFilingSubmissionRow(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
  patch: FilingSubmissionPatch,
): Promise<FilingSubmissionRow> {
  return db.transaction(async (tx) => {
    const before = await getFilingSubmissionRow(tx, year, kind);
    const now = new Date();
    const [row] = await tx
      .insert(filingSubmissionsTable)
      .values({
        year,
        kind,
        ownerUserId: ownerIdForWrite(),
        acceptanceNumber: patch.acceptanceNumber ?? "",
        submittedDate: patch.submittedDate ?? null,
        receiptFileId: patch.receiptFileId ?? null,
        receiptMimeType: patch.receiptMimeType ?? "",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          filingSubmissionsTable.ownerUserId,
          filingSubmissionsTable.year,
          filingSubmissionsTable.kind,
        ],
        set: {
          ...(patch.acceptanceNumber !== undefined
            ? { acceptanceNumber: patch.acceptanceNumber }
            : {}),
          ...(patch.submittedDate !== undefined ? { submittedDate: patch.submittedDate } : {}),
          ...(patch.receiptFileId !== undefined ? { receiptFileId: patch.receiptFileId } : {}),
          ...(patch.receiptMimeType !== undefined
            ? { receiptMimeType: patch.receiptMimeType }
            : {}),
          updatedAt: now,
        },
      })
      .returning();
    await tx.insert(filingSubmissionHistoryTable).values({
      year,
      kind,
      ownerUserId: ownerIdForWrite(),
      action: before ? "updated" : "created",
      before: before ? filingSubmissionToApi(before) : null,
      after: row ? filingSubmissionToApi(row) : null,
      createdAt: now,
    });
    return row!;
  });
}

/**
 * 提出記録を削除し、変更履歴を1行残す。削除した行を返す
 * （無ければ null）。受信通知の実体の削除は呼び出し側で行う。
 */
export async function deleteFilingSubmissionRow(
  db: Db,
  year: number,
  kind: FilingSubmissionKind,
): Promise<FilingSubmissionRow | null> {
  return db.transaction(async (tx) => {
    const before = await getFilingSubmissionRow(tx, year, kind);
    if (!before) return null;
    await tx.delete(filingSubmissionsTable).where(targetConditions(year, kind));
    await tx.insert(filingSubmissionHistoryTable).values({
      year,
      kind,
      ownerUserId: ownerIdForWrite(),
      action: "deleted",
      before: filingSubmissionToApi(before),
      after: null,
      createdAt: new Date(),
    });
    return before;
  });
}
