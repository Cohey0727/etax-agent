/**
 * transactionWrites.ts — 取引の登録・更新（services/transactions）。
 *
 * 帳簿画面（REST）・MCP・対話エージェントが共用する本体。入力の検証、
 * 未指定の項目の既定値、分類の学習履歴への記録の規則をここに集める。
 * 収入区分を省いた場合は、CSV 取込と同じ区分推定（guessIncomeType）で決める。
 */
import { IncomeType, guessIncomeType, normalizeBusinessRatio } from "@etax/shared";
import { Db } from "../../lib/db";
import { BusinessError, errorMessage } from "../../lib/errors";
import { recordClassification } from "../../repositories/classificationHistoryRepository";
import { linkReceiptRow } from "../../repositories/receiptRepository";
import { TransactionRow } from "../../repositories/schema";
import {
  getTransactionRow,
  insertTransactionRowWith,
  updateTransactionRow,
} from "../../repositories/transactionRepository";
import { CalendarDateSchema } from "../../schemas/common";

/** 取引の入力が不正で保存しなかったことを表す例外（400）。 */
export class TransactionInputError extends BusinessError {}

/** 取引の入力（登録では date・amount が必須、更新では渡した項目だけを変える）。 */
export interface TransactionInput {
  date?: string;
  /** 割り当て年度。1900〜2100 の整数でなければ、登録では日付の年、更新では変更しない。 */
  fiscalYear?: number;
  description?: string;
  /** 符号つき税込金額（収入は正、支出は負）。0 は受け付けない。 */
  amount?: number;
  account?: string;
  /** 勘定科目。空なら未分類。 */
  category?: string;
  incomeType?: IncomeType;
  taxCategory?: string;
  businessRatioPercent?: number;
  businessRatioBasis?: string;
}

export interface TransactionWriteOptions {
  /** 科目を分類の学習履歴に記録するか（画面は確定時に別途記録するため false）。 */
  learn: boolean;
}

export interface TransactionWriteResult {
  transaction: TransactionRow;
  /** 学習履歴に記録できなかったときの理由（取引は保存済み）。記録できたか不要なら null。 */
  learningWarning: string | null;
}

const UNCLASSIFIED = "未分類";

function assertCalendarDate(date: string | undefined): string {
  if (date === undefined || !CalendarDateSchema.safeParse(date).success) {
    throw new TransactionInputError(400, "date は存在する日付を YYYY-MM-DD 形式で指定してください");
  }
  return date;
}

function assertAmount(amount: number | undefined): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new TransactionInputError(400, "amount は数値で指定してください");
  }
  const truncated = Math.trunc(amount);
  if (truncated === 0) {
    throw new TransactionInputError(400, "amount は 0 以外の数値で指定してください（収入は正、支出は負）");
  }
  return truncated;
}

function validFiscalYear(fiscalYear: number | undefined): number | undefined {
  return typeof fiscalYear === "number" &&
    Number.isInteger(fiscalYear) &&
    fiscalYear >= 1900 &&
    fiscalYear <= 2100
    ? fiscalYear
    : undefined;
}

function categoryOrUnclassified(category: string | undefined): string {
  return category ? category : UNCLASSIFIED;
}

/**
 * 保存済みの取引の科目を学習履歴に記録する。取引はすでに確定しているため、
 * 記録の失敗で保存全体を失敗にすると、再実行で取引が二重に登録される。
 * 失敗は警告文として返す（成功なら null）。
 */
export async function recordClassificationAfterSave(
  description: string,
  category: string,
): Promise<string | null> {
  try {
    await recordClassification(description, category);
    return null;
  } catch (e) {
    console.warn(`[transactions] 分類の学習履歴に記録できませんでした: ${errorMessage(e)}`);
    return `取引は保存しましたが、分類の学習履歴には記録できませんでした: ${errorMessage(e)}`;
  }
}

/**
 * 取引を1件登録する。receiptFileIds があれば、同じ実行単位で証憑を紐付ける
 * （紐付けだけ失敗して取引が残る不整合を防ぐ）。
 */
export async function createTransaction(
  db: Db,
  input: TransactionInput,
  options: TransactionWriteOptions & { receiptFileIds?: readonly string[] },
): Promise<TransactionWriteResult> {
  const date = assertCalendarDate(input.date);
  const amount = assertAmount(input.amount);
  const description = input.description ?? "";
  const category = categoryOrUnclassified(input.category);
  const row = await db.transaction(async (tx) => {
    const inserted = await insertTransactionRowWith(tx, {
      date,
      fiscalYear: validFiscalYear(input.fiscalYear) ?? Number(date.slice(0, 4)),
      description,
      amount,
      account: input.account ?? "",
      category,
      incomeType: input.incomeType ?? guessIncomeType(description, category),
      taxCategory: input.taxCategory ?? "",
      businessRatioPercent: normalizeBusinessRatio(input.businessRatioPercent),
      businessRatioBasis: input.businessRatioBasis ?? "",
    });
    if (inserted) {
      for (const fileId of options.receiptFileIds ?? []) {
        await linkReceiptRow(tx, fileId, inserted.id);
      }
    }
    return inserted;
  });
  if (!row) throw new Error("取引の登録に失敗しました");
  const learningWarning =
    options.learn && category !== UNCLASSIFIED
      ? await recordClassificationAfterSave(row.description, category)
      : null;
  return { transaction: row, learningWarning };
}

/**
 * 取引を部分更新する（渡した項目だけを変える）。対象が無ければ null。
 * 学習履歴には、科目が変わったときだけ記録する（他の項目だけの修正で
 * 同じ対応の確定回数が増えないように）。
 */
export async function updateTransaction(
  db: Db,
  id: number,
  input: TransactionInput,
  options: TransactionWriteOptions,
): Promise<TransactionWriteResult | null> {
  const patch: Partial<TransactionRow> = {};
  if (input.date !== undefined) patch.date = assertCalendarDate(input.date);
  const fiscalYear = validFiscalYear(input.fiscalYear);
  if (fiscalYear !== undefined) patch.fiscalYear = fiscalYear;
  if (input.description !== undefined) patch.description = input.description;
  if (input.amount !== undefined) patch.amount = assertAmount(input.amount);
  if (input.account !== undefined) patch.account = input.account;
  if (input.category !== undefined) patch.category = categoryOrUnclassified(input.category);
  if (input.incomeType !== undefined) patch.incomeType = input.incomeType;
  if (input.taxCategory !== undefined) patch.taxCategory = input.taxCategory;
  if (typeof input.businessRatioPercent === "number" && Number.isFinite(input.businessRatioPercent)) {
    patch.businessRatioPercent = normalizeBusinessRatio(input.businessRatioPercent);
  }
  if (input.businessRatioBasis !== undefined) patch.businessRatioBasis = input.businessRatioBasis;
  const before =
    options.learn && patch.category !== undefined ? await getTransactionRow(db, id) : null;
  const row = await updateTransactionRow(db, id, patch);
  if (!row) return null;
  const learningWarning =
    patch.category !== undefined &&
    patch.category !== UNCLASSIFIED &&
    before !== null &&
    before.category !== patch.category
      ? await recordClassificationAfterSave(row.description, patch.category)
      : null;
  return { transaction: row, learningWarning };
}
