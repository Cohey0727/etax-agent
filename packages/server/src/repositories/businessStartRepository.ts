/**
 * businessStartRepository.ts — 開業届・青色申告承認申請書の専用入力の
 * 保存（repositories）。開業は一度きりの手続きで年度に属さないため、
 * 所有者ごとに1件だけ保持する。状態は BusinessStartInputs の JSON で、
 * 形の検証は usecase 側の Zod スキーマが担う。
 */
import { eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { ownerIdForWrite } from "../lib/tenantContext";
import { BusinessStartInputRow, businessStartInputsTable } from "./schema";

/** 専用入力を取得する。無ければ undefined。 */
export async function getBusinessStartInputRow(
  db: Db,
): Promise<BusinessStartInputRow | undefined> {
  const owner = ownerIdForWrite();
  const [row] = await db
    .select()
    .from(businessStartInputsTable)
    .where(eq(businessStartInputsTable.ownerUserId, owner));
  return row;
}

/** 専用入力を保存（作成または更新）する。 */
export async function upsertBusinessStartInputRow(
  db: Db,
  state: unknown,
): Promise<BusinessStartInputRow> {
  const owner = ownerIdForWrite();
  const values = {
    ownerUserId: owner,
    state: JSON.stringify(state),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(businessStartInputsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [businessStartInputsTable.ownerUserId],
      set: { state: values.state, updatedAt: values.updatedAt },
    })
    .returning();
  return row;
}
