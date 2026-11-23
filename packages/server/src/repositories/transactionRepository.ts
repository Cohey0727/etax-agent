/**
 * transactionRepository.ts — 取引テーブルへのデータアクセス（repositories）。
 *
 * 行 → API 形式への変換もここで行う（created_at は ISO 文字列にする。
 * Date のまま JSON 化しても同一文字列になるため、ワイヤ形式は変わらない）。
 *
 * 電子帳簿保存法の訂正・削除履歴の要件に対応するため、取引は物理削除せず
 * 論理削除（deleted_at）にし、登録・更新・削除のたびに変更前後の値を
 * transaction_history へ残す。通常の読み取りは削除済みを返さない。
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Db } from "../lib/db";
import {
  TransactionHistoryEntryResponse,
  TransactionResponse,
} from "../schemas/transaction";
import {
  TransactionHistoryRow,
  TransactionRow,
  transactionHistoryTable,
  transactionsTable,
} from "./schema";

/**
 * 取引の割り当て年度。fiscal_year が未設定（0）の行は日付の年として扱う
 * （移行直後・直接投入された行への保険。ensureTables が起動時に埋める）。
 */
export function effectiveFiscalYear(row: { fiscalYear: number; date: string }): number {
  return row.fiscalYear || Number(row.date.slice(0, 4)) || 0;
}

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function transactionToApi(row: TransactionRow): TransactionResponse {
  return {
    id: row.id,
    date: row.date,
    fiscal_year: effectiveFiscalYear(row),
    description: row.description,
    amount: row.amount,
    account: row.account,
    category: row.category,
    income_type: row.incomeType,
    tax_category: row.taxCategory,
    import_id: row.importId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/** 変更履歴の DB 行を API レスポンス形式に変換する。 */
export function transactionHistoryToApi(
  row: TransactionHistoryRow,
): TransactionHistoryEntryResponse {
  return {
    id: row.id,
    transaction_id: row.transactionId,
    action: row.action,
    before: (row.before as TransactionResponse | null) ?? null,
    after: (row.after as TransactionResponse | null) ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** 変更履歴を1件残す。before / after は API 形式のスナップショット。 */
async function recordTransactionHistory(
  db: Db,
  transactionId: number,
  action: "created" | "updated" | "deleted",
  before: TransactionResponse | null,
  after: TransactionResponse | null,
): Promise<void> {
  await db.insert(transactionHistoryTable).values({
    transactionId,
    action,
    before: before as unknown as Record<string, unknown> | null,
    after: after as unknown as Record<string, unknown> | null,
  });
}

/** 削除されていない取引を1件取得する。無ければ undefined。 */
async function getActiveTransactionRow(
  db: Db,
  id: number,
): Promise<TransactionRow | undefined> {
  const [row] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)));
  return row;
}

/**
 * 取引を日付・id 順に取得する（削除済みは含まない）。incomeType があれば
 * SQL で絞り込む（対象年の絞り込みは従来どおり呼び出し側で行う）。
 */
export async function listTransactionRows(
  db: Db,
  incomeType?: string,
): Promise<TransactionRow[]> {
  const where = incomeType
    ? and(eq(transactionsTable.incomeType, incomeType), isNull(transactionsTable.deletedAt))
    : isNull(transactionsTable.deletedAt);
  return db
    .select()
    .from(transactionsTable)
    .where(where)
    .orderBy(asc(transactionsTable.date), asc(transactionsTable.id));
}

/** 取引の変更履歴を新しい順に取得する。 */
export async function listTransactionHistoryRows(
  db: Db,
  transactionId: number,
): Promise<TransactionHistoryRow[]> {
  return db
    .select()
    .from(transactionHistoryTable)
    .where(eq(transactionHistoryTable.transactionId, transactionId))
    .orderBy(desc(transactionHistoryTable.id));
}

/** 取引を1件登録し、登録された行を返す。変更履歴（登録）も残す。 */
export async function insertTransactionRow(
  db: Db,
  values: {
    date: string;
    fiscalYear: number;
    description: string;
    amount: number;
    account: string;
    category: string;
    incomeType: string;
    taxCategory: string;
  },
): Promise<TransactionRow | undefined> {
  const [row] = await db.insert(transactionsTable).values(values).returning();
  if (row) {
    await recordTransactionHistory(db, row.id, "created", null, transactionToApi(row));
  }
  return row;
}

/** 取引を部分更新し、更新された行を返す。対象が無ければ undefined。変更履歴も残す。 */
export async function updateTransactionRow(
  db: Db,
  id: number,
  patch: Partial<TransactionRow>,
): Promise<TransactionRow | undefined> {
  const before = await getActiveTransactionRow(db, id);
  if (!before) return undefined;
  const [row] = await db
    .update(transactionsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (row) {
    await recordTransactionHistory(
      db,
      id,
      "updated",
      transactionToApi(before),
      transactionToApi(row),
    );
  }
  return row;
}

/**
 * 取引を論理削除し、削除済みの行を返す。対象が無ければ undefined。
 * 物理削除はせず deleted_at を立て、変更履歴（削除）も残す。
 */
export async function deleteTransactionRow(
  db: Db,
  id: number,
): Promise<TransactionRow | undefined> {
  const before = await getActiveTransactionRow(db, id);
  if (!before) return undefined;
  const now = new Date();
  const [row] = await db
    .update(transactionsTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (row) {
    await recordTransactionHistory(
      db,
      id,
      "deleted",
      transactionToApi(before),
      transactionToApi(row),
    );
  }
  return row;
}

/**
 * 重複判定用の指紋項目だけを全件取得する（CSV再取込の二重計上防止用）。
 * 科目や収入区分は後から変わるため含めない。削除済みの取引も含める:
 * 削除した取引が再取込で勝手に復活しないようにするため。
 */
export async function listTransactionFingerprintRows(db: Db): Promise<
  {
    date: string;
    amount: number;
    description: string;
    account: string;
    taxCategory: string;
  }[]
> {
  return db
    .select({
      date: transactionsTable.date,
      amount: transactionsTable.amount,
      description: transactionsTable.description,
      account: transactionsTable.account,
      taxCategory: transactionsTable.taxCategory,
    })
    .from(transactionsTable);
}

/**
 * 指定した割り当て年度の取引を丸ごと置き換える（画面側の確定状態を帳簿の正とする）。
 * 削除対象は日付ではなく割り当て年度で決める（日付が他年の取引も含む）。
 * 置き換えで消える取引は論理削除にし、変更履歴（削除・登録）を残す。
 * 取込リンク（import_id）は外れる。削除と挿入は1トランザクションで行う。
 */
export async function replaceYearTransactionRows(
  db: Db,
  year: number,
  values: readonly {
    date: string;
    fiscalYear: number;
    description: string;
    amount: number;
    account: string;
    category: string;
    incomeType: string;
    taxCategory: string;
  }[],
): Promise<TransactionRow[]> {
  // better-sqlite3 ドライバではトランザクションのコールバックは同期実行する
  // （await を挟むと "Transaction function cannot return a promise" になる）。
  return db.transaction((tx) => {
    const now = new Date();
    const beforeRows = tx
      .select()
      .from(transactionsTable)
      .where(
        and(eq(transactionsTable.fiscalYear, year), isNull(transactionsTable.deletedAt)),
      )
      .all();
    tx.update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(eq(transactionsTable.fiscalYear, year), isNull(transactionsTable.deletedAt)),
      )
      .run();
    for (const beforeRow of beforeRows) {
      tx.insert(transactionHistoryTable)
        .values({
          transactionId: beforeRow.id,
          action: "deleted",
          before: transactionToApi(beforeRow),
          after: { ...transactionToApi(beforeRow), deleted_at: now.toISOString(), updated_at: now.toISOString() },
        })
        .run();
    }
    if (values.length === 0) return [];
    const inserted = tx
      .insert(transactionsTable)
      .values([...values])
      .returning()
      .all();
    for (const row of inserted) {
      tx.insert(transactionHistoryTable)
        .values({
          transactionId: row.id,
          action: "created",
          before: null,
          after: transactionToApi(row),
        })
        .run();
    }
    return inserted.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  });
}
