/**
 * replaceYearTransactions.ts — 対象年の取引の一括置き換え（services/transactions）。
 *
 * 帳簿画面の年次保存（REST の /api/transactions/replace-year）と MCP の
 * replace_year_transactions が共用する。既存分は論理削除して変更履歴に残し、
 * 渡された一覧で置き換える。
 */
import { normalizeBusinessRatio } from "@etax/shared";
import { Db } from "../../lib/db";
import { TransactionRow } from "../../repositories/schema";
import { replaceYearTransactionRows } from "../../repositories/transactionRepository";
import { ReplaceYearTransactionsRequest } from "../../schemas/transaction";
import { TransactionInputError } from "./transactionWrites";

/** 対象年の取引を置き換え、置き換え後の取引を返す。不正な入力は TransactionInputError。 */
export async function replaceYearTransactions(
  db: Db,
  request: ReplaceYearTransactionsRequest,
): Promise<TransactionRow[]> {
  const { year, transactions } = request;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new TransactionInputError(400, "year が不正です");
  }
  const values = transactions.map((body) => {
    const date = body.date ?? "";
    // 形式だけを見る（暦として存在するかは見ない）。画面はその年の既存の取引も
    // まとめて送り直すため、他の経路で入った不正な日付が1件あるだけで、
    // その年の保存全体を拒むことになる。
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new TransactionInputError(400, "date は YYYY-MM-DD 形式で指定してください");
    }
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
      throw new TransactionInputError(400, "amount は数値で指定してください");
    }
    return {
      date,
      // 割り当て年度は各取引の指定があればそれ、無ければ置き換え対象の年。
      // 日付が対象年と違ってもよい（年末のカード利用など）。
      fiscalYear:
        typeof body.fiscal_year === "number" &&
        Number.isInteger(body.fiscal_year) &&
        body.fiscal_year >= 1900 &&
        body.fiscal_year <= 2100
          ? body.fiscal_year
          : year,
      description: body.description ?? "",
      amount: Math.trunc(body.amount),
      account: body.account ?? "",
      category: body.category ? body.category : "未分類",
      incomeType: body.income_type ?? "other",
      taxCategory: body.tax_category ?? "",
      businessRatioPercent: normalizeBusinessRatio(body.business_ratio_percent),
      businessRatioBasis: body.business_ratio_basis ?? "",
    };
  });
  return replaceYearTransactionRows(db, year, values);
}
