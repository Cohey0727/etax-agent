/**
 * importRepository.ts — 取込履歴（imports）テーブルへのデータアクセス（repositories）。
 */
import { desc, eq } from "drizzle-orm";
import { Transaction, normalizeBusinessRatio } from "@etax/shared";
import { Db } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import { CsvMapping } from "../schemas/importCsv";
import { ImportRecordResponse } from "../schemas/importRecord";
import { ImportRow, importsTable, transactionHistoryTable, transactionsTable } from "./schema";
import {
  BULK_INSERT_CHUNK_SIZE,
  chunkArray,
  transactionToApi,
} from "./transactionRepository";

/** DB行を API レスポンス形式に変換する（createdAt は ISO 文字列にする）。 */
export function importToApi(row: ImportRow): ImportRecordResponse {
  return {
    id: row.id,
    filename: row.filename,
    sourceName: row.sourceName,
    mapping: row.mapping,
    rowCount: row.rowCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 取込履歴を新しい順に最大100件取得する（テナント文脈があれば所有者で絞る）。 */
export async function listImportRows(db: Db): Promise<ImportRow[]> {
  const owner = currentUserId();
  const query = db.select().from(importsTable);
  const filtered =
    owner !== undefined ? query.where(eq(importsTable.ownerUserId, owner)) : query;
  return filtered.orderBy(desc(importsTable.id)).limit(100);
}

/**
 * 取込1回分を保存する: imports に記録を作り、取引があれば紐づけて登録する。
 * 作成された取込の id を返す（取得できなければ undefined）。
 * 取込記録・取引・変更履歴は1トランザクションで書き、途中で失敗しても
 * 半端な取込が残らないようにする。大量行はパラメータ上限対策で
 * チャンクに分けて INSERT する。
 */
export async function createImportWithTransactions(
  db: Db,
  input: {
    filename: string;
    sourceName: string;
    mapping: CsvMapping;
    transactions: Transaction[];
  },
): Promise<number | undefined> {
  const ownerUserId = ownerIdForWrite();
  return db.transaction(async (tx) => {
    const [imp] = await tx
      .insert(importsTable)
      .values({
        filename: input.filename,
        sourceName: input.sourceName,
        mapping: input.mapping as unknown as Record<string, unknown>,
        rowCount: input.transactions.length,
        ownerUserId,
      })
      .returning({ id: importsTable.id });
    const importId = imp?.id;
    if (input.transactions.length > 0 && importId !== undefined) {
      const inserted: (typeof transactionsTable.$inferSelect)[] = [];
      for (const chunk of chunkArray(input.transactions, BULK_INSERT_CHUNK_SIZE)) {
        const rows = await tx
          .insert(transactionsTable)
          .values(
            chunk.map((t) => ({
              date: t.date,
              // 割り当て年度は日付の年で埋める（起動時バックフィルと同じ意味論。
              // 既定値 0 のままだと年度置換の削除対象から漏れて二重化する）。
              fiscalYear: Number(t.date.slice(0, 4)) || 0,
              description: t.description,
              amount: t.amount,
              account: t.account,
              category: t.category,
              incomeType: t.income_type,
              taxCategory: t.tax_category,
              businessRatioPercent: normalizeBusinessRatio(t.business_ratio_percent),
              businessRatioBasis: t.business_ratio_basis ?? "",
              importId,
              ownerUserId,
            })),
          )
          .returning();
        inserted.push(...rows);
      }
      // 取込で登録した取引も変更履歴（登録）を残す（電子帳簿保存法の履歴要件）。
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
    }
    return importId;
  });
}
