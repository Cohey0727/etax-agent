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
import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { Db, DbOrTx } from "../lib/db";

/**
 * バルク INSERT のチャンク幅。PostgreSQL のパラメータ上限（65,535）に
 * 達しないよう、1回の INSERT はこの件数までに区切る。
 */
export const BULK_INSERT_CHUNK_SIZE = 1000;

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
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
 * （年度を指定せずに入った行への保険。ensureTables が起動時に埋める）。
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
    business_ratio_percent: row.businessRatioPercent,
    business_ratio_basis: row.businessRatioBasis,
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
  db: DbOrTx,
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
  db: DbOrTx,
  id: number,
): Promise<TransactionRow | undefined> {
  const owner = currentUserId();
  const conditions = [eq(transactionsTable.id, id), isNull(transactionsTable.deletedAt)];
  if (owner !== undefined) conditions.push(eq(transactionsTable.ownerUserId, owner));
  const [row] = await db
    .select()
    .from(transactionsTable)
    .where(and(...conditions));
  return row;
}

/** 削除されていない取引を1件取得する（他リポジトリ・ユースケース用）。無ければ null。 */
export async function getTransactionRow(db: DbOrTx, id: number): Promise<TransactionRow | null> {
  return (await getActiveTransactionRow(db, id)) ?? null;
}

/**
 * 割り当て年度が year の取引の条件。未設定（0）の行は日付の年で判定する
 * （effectiveFiscalYear と同じ意味論を SQL で表す）。一覧と年度の置き換えで
 * 同じ条件を使い、一覧に出る行と置き換えで消える行を揃える。
 */
function fiscalYearCondition(year: number) {
  return or(
    eq(transactionsTable.fiscalYear, year),
    and(eq(transactionsTable.fiscalYear, 0), like(transactionsTable.date, `${year}-%`)),
  )!;
}

/**
 * 取引を日付・id 順に取得する（削除済みは含まない）。incomeType / year が
 * あれば SQL で絞り込む（year は fiscalYearCondition）。
 */
export async function listTransactionRows(
  db: Db,
  incomeType?: string,
  year?: number,
): Promise<TransactionRow[]> {
  const owner = currentUserId();
  const conditions = [isNull(transactionsTable.deletedAt)];
  if (incomeType) conditions.push(eq(transactionsTable.incomeType, incomeType));
  if (year !== undefined) conditions.push(fiscalYearCondition(year));
  if (owner !== undefined) conditions.push(eq(transactionsTable.ownerUserId, owner));
  return db
    .select()
    .from(transactionsTable)
    .where(and(...conditions))
    .orderBy(asc(transactionsTable.date), asc(transactionsTable.id));
}

/**
 * 取引の変更履歴を新しい順に取得する。
 * テナント文脈がある場合は親取引の所有者を確認し、他テナントの取引の
 * 履歴は返さない（履歴自体に所有者列が無いため親で判定する。
 * 論理削除済みの取引の履歴も正規の参照なので削除済みも対象に含める）。
 */
export async function listTransactionHistoryRows(
  db: Db,
  transactionId: number,
): Promise<TransactionHistoryRow[]> {
  const owner = currentUserId();
  if (owner !== undefined) {
    const [parent] = await db
      .select({ ownerUserId: transactionsTable.ownerUserId })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId));
    if (!parent || parent.ownerUserId !== owner) return [];
  }
  return db
    .select()
    .from(transactionHistoryTable)
    .where(eq(transactionHistoryTable.transactionId, transactionId))
    .orderBy(desc(transactionHistoryTable.id));
}

/**
 * 全取引の変更履歴を新しい順に取得する（帳簿の履歴ビューア用）。
 * 履歴自体に所有者列が無いため、テナント文脈がある場合は親取引と
 * 結合して所有者で絞る。論理削除済みの取引の履歴も対象に含める。
 */
export async function listRecentTransactionHistoryRows(
  db: Db,
  limit: number,
): Promise<TransactionHistoryRow[]> {
  const owner = currentUserId();
  if (owner === undefined) {
    return db
      .select()
      .from(transactionHistoryTable)
      .orderBy(desc(transactionHistoryTable.id))
      .limit(limit);
  }
  const rows = await db
    .select({ history: transactionHistoryTable })
    .from(transactionHistoryTable)
    .innerJoin(
      transactionsTable,
      eq(transactionHistoryTable.transactionId, transactionsTable.id),
    )
    .where(eq(transactionsTable.ownerUserId, owner))
    .orderBy(desc(transactionHistoryTable.id))
    .limit(limit);
  return rows.map((row) => row.history);
}

type TransactionValues = {
  date: string;
  fiscalYear: number;
  description: string;
  amount: number;
  account: string;
  category: string;
  incomeType: string;
  taxCategory: string;
  businessRatioPercent: number;
  businessRatioBasis: string;
};

/** 取引を1件登録する（executor 版）。変更履歴（登録）も同じ実行単位で残す。 */
export async function insertTransactionRowWith(
  executor: DbOrTx,
  values: TransactionValues,
): Promise<TransactionRow | undefined> {
  const [row] = await executor
    .insert(transactionsTable)
    .values({ ...values, ownerUserId: ownerIdForWrite() })
    .returning();
  if (row) {
    await recordTransactionHistory(executor, row.id, "created", null, transactionToApi(row));
  }
  return row;
}

/**
 * 取引を1件登録し、登録された行を返す。変更履歴（登録）も残す。
 * 登録と履歴は1トランザクションで行う（片方だけ残る不整合を防ぐ）。
 */
export async function insertTransactionRow(
  db: Db,
  values: TransactionValues,
): Promise<TransactionRow | undefined> {
  return db.transaction((tx) => insertTransactionRowWith(tx, values));
}

/** 取引を部分更新する（executor 版）。変更履歴も同じ実行単位で残す。 */
export async function updateTransactionRowWith(
  executor: DbOrTx,
  id: number,
  patch: Partial<TransactionRow>,
): Promise<TransactionRow | undefined> {
  const before = await getActiveTransactionRow(executor, id);
  if (!before) return undefined;
  const [row] = await executor
    .update(transactionsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (row) {
    await recordTransactionHistory(
      executor,
      id,
      "updated",
      transactionToApi(before),
      transactionToApi(row),
    );
  }
  return row;
}

/** 取引を部分更新し、更新された行を返す。対象が無ければ undefined。変更履歴も残す。 */
export async function updateTransactionRow(
  db: Db,
  id: number,
  patch: Partial<TransactionRow>,
): Promise<TransactionRow | undefined> {
  return db.transaction((tx) => updateTransactionRowWith(tx, id, patch));
}

/** 取引を論理削除する（executor 版）。変更履歴（削除）も同じ実行単位で残す。 */
export async function deleteTransactionRowWith(
  executor: DbOrTx,
  id: number,
): Promise<TransactionRow | undefined> {
  const before = await getActiveTransactionRow(executor, id);
  if (!before) return undefined;
  const now = new Date();
  const [row] = await executor
    .update(transactionsTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (row) {
    await recordTransactionHistory(
      executor,
      id,
      "deleted",
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
  return db.transaction((tx) => deleteTransactionRowWith(tx, id));
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
  // テナント文脈がある場合は自テナントの行だけで判定する
  // （他テナントの同一取引で自テナントの取込が「重複」扱いになるのを防ぐ）。
  const owner = currentUserId();
  const query = db
    .select({
      date: transactionsTable.date,
      amount: transactionsTable.amount,
      description: transactionsTable.description,
      account: transactionsTable.account,
      taxCategory: transactionsTable.taxCategory,
    })
    .from(transactionsTable);
  return owner !== undefined
    ? query.where(eq(transactionsTable.ownerUserId, owner))
    : query;
}

/**
 * 指定した割り当て年度の取引を丸ごと置き換える（画面側の確定状態を帳簿の正とする）。
 * 削除対象は日付ではなく割り当て年度で決める（日付が他年の取引も含む。
 * 割り当て年度が未設定の行は日付の年で判定する）。
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
    businessRatioPercent: number;
    businessRatioBasis: string;
  }[],
): Promise<TransactionRow[]> {
  // PostgreSQL ドライバのトランザクションは非同期実行する
  // （コールバック内のクエリはすべて await する）。
  return db.transaction(async (tx) => {
    const now = new Date();
    const owner = currentUserId();
    const yearConditions = [fiscalYearCondition(year), isNull(transactionsTable.deletedAt)];
    if (owner !== undefined) yearConditions.push(eq(transactionsTable.ownerUserId, owner));
    const beforeRows = await tx
      .select()
      .from(transactionsTable)
      .where(and(...yearConditions));
    await tx
      .update(transactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(...yearConditions));
    // 履歴は1行ずつでなくまとめて書く（N+1 解消）。大量件数でも
    // パラメータ上限に達しないようチャンクに分ける。
    for (const chunk of chunkArray(beforeRows, BULK_INSERT_CHUNK_SIZE)) {
      await tx.insert(transactionHistoryTable).values(
        chunk.map((beforeRow) => ({
          transactionId: beforeRow.id,
          action: "deleted",
          before: transactionToApi(beforeRow) as unknown as Record<string, unknown>,
          after: {
            ...transactionToApi(beforeRow),
            deleted_at: now.toISOString(),
            updated_at: now.toISOString(),
          } as unknown as Record<string, unknown>,
        })),
      );
    }
    if (values.length === 0) return [];
    const ownerUserId = ownerIdForWrite();
    const inserted: TransactionRow[] = [];
    for (const chunk of chunkArray(values, BULK_INSERT_CHUNK_SIZE)) {
      const rows = await tx
        .insert(transactionsTable)
        .values(chunk.map((v) => ({ ...v, ownerUserId })))
        .returning();
      inserted.push(...rows);
    }
    for (const chunk of chunkArray(inserted, BULK_INSERT_CHUNK_SIZE)) {
      await tx.insert(transactionHistoryTable).values(
        chunk.map((row) => ({
          transactionId: row.id,
          action: "created",
          before: null,
          after: transactionToApi(row) as unknown as Record<string, unknown>,
        })),
      );
    }
    return inserted.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  });
}
