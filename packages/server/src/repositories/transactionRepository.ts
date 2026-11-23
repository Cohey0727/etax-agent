/**
 * transactionRepository.ts — 取引テーブルへのデータアクセス（repositories）。
 *
 * 行 → API 形式への変換もここで行う（created_at は ISO 文字列にする。
 * Date のまま JSON 化しても同一文字列になるため、ワイヤ形式は変わらない）。
 */
import { and, asc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { TransactionResponse } from "../schemas/transaction";
import { TransactionRow, transactionsTable } from "./schema";

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
  };
}

/**
 * 取引を日付・id 順に取得する。incomeType があれば SQL で絞り込む
 * （対象年の絞り込みは従来どおり呼び出し側で日付文字列の前方一致で行う）。
 */
export async function listTransactionRows(
  db: Db,
  incomeType?: string,
): Promise<TransactionRow[]> {
  const where = incomeType ? and(eq(transactionsTable.incomeType, incomeType)) : undefined;
  return db
    .select()
    .from(transactionsTable)
    .where(where)
    .orderBy(asc(transactionsTable.date), asc(transactionsTable.id));
}

/** 取引を1件登録し、登録された行を返す。 */
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
  return row;
}

/** 取引を部分更新し、更新された行を返す。対象が無ければ undefined。 */
export async function updateTransactionRow(
  db: Db,
  id: number,
  patch: Partial<TransactionRow>,
): Promise<TransactionRow | undefined> {
  const [row] = await db
    .update(transactionsTable)
    .set(patch)
    .where(eq(transactionsTable.id, id))
    .returning();
  return row;
}

/** 取引を1件削除し、削除された行を返す。対象が無ければ undefined。 */
export async function deleteTransactionRow(
  db: Db,
  id: number,
): Promise<TransactionRow | undefined> {
  const [row] = await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.id, id))
    .returning();
  return row;
}

/**
 * 重複判定用の指紋項目だけを全件取得する（CSV再取込の二重計上防止用）。
 * 科目や収入区分は後から変わるため含めない。
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
    tx.delete(transactionsTable)
      .where(eq(transactionsTable.fiscalYear, year))
      .run();
    if (values.length === 0) return [];
    const inserted = tx
      .insert(transactionsTable)
      .values([...values])
      .returning()
      .all();
    return inserted.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  });
}
