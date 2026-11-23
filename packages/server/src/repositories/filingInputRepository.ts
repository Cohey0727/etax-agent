/**
 * filingInputRepository.ts — 申告入力（控除・税額控除・雑所得・申告種別）の
 * 年度別保存（repositories）。状態は画面側の DeductionState の JSON を
 * そのまま保持する（形の検証は画面側の読み込み処理が担う）。
 */
import { and, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { ownerIdForWrite } from "../lib/tenantContext";
import { FilingInputRow, filingInputsTable } from "./schema";

/** 対象年の申告入力を取得する。無ければ undefined。 */
export async function getFilingInputRow(
  db: Db,
  year: number,
): Promise<FilingInputRow | undefined> {
  const owner = ownerIdForWrite();
  const [row] = await db
    .select()
    .from(filingInputsTable)
    .where(
      and(eq(filingInputsTable.ownerUserId, owner), eq(filingInputsTable.year, year)),
    );
  return row;
}

/** 対象年の申告入力を保存（作成または更新）する。 */
export async function upsertFilingInputRow(
  db: Db,
  year: number,
  state: unknown,
): Promise<FilingInputRow> {
  const owner = ownerIdForWrite();
  const values = {
    ownerUserId: owner,
    year,
    state: JSON.stringify(state),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(filingInputsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [filingInputsTable.ownerUserId, filingInputsTable.year],
      set: { state: values.state, updatedAt: values.updatedAt },
    })
    .returning();
  return row;
}
