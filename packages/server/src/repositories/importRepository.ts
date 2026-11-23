/**
 * importRepository.ts — 取込履歴（imports）テーブルへのデータアクセス（repositories）。
 */
import { desc } from "drizzle-orm";
import { Transaction } from "@etax/shared";
import { Db } from "../lib/db";
import { CsvMapping } from "../schemas/importCsv";
import { ImportRecordResponse } from "../schemas/importRecord";
import { ImportRow, importsTable, transactionHistoryTable, transactionsTable } from "./schema";
import { transactionToApi } from "./transactionRepository";

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

/** 取込履歴を新しい順に最大100件取得する。 */
export async function listImportRows(db: Db): Promise<ImportRow[]> {
  return db.select().from(importsTable).orderBy(desc(importsTable.id)).limit(100);
}

/**
 * 取込1回分を保存する: imports に記録を作り、取引があれば紐づけて登録する。
 * 作成された取込の id を返す（取得できなければ undefined）。
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
  const [imp] = await db
    .insert(importsTable)
    .values({
      filename: input.filename,
      sourceName: input.sourceName,
      mapping: input.mapping as unknown as Record<string, unknown>,
      rowCount: input.transactions.length,
    })
    .returning({ id: importsTable.id });
  const importId = imp?.id;
  if (input.transactions.length > 0 && importId !== undefined) {
    const inserted = await db
      .insert(transactionsTable)
      .values(
        input.transactions.map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          account: t.account,
          category: t.category,
          incomeType: t.income_type,
          taxCategory: t.tax_category,
          importId,
        })),
      )
      .returning();
    // 取込で登録した取引も変更履歴（登録）を残す（電子帳簿保存法の履歴要件）。
    await db.insert(transactionHistoryTable).values(
      inserted.map((row) => ({
        transactionId: row.id,
        action: "created",
        before: null,
        after: transactionToApi(row) as unknown as Record<string, unknown>,
      })),
    );
  }
  return importId;
}
