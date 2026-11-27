/**
 * trialBalance.ts — 試算表レポートのスキーマ（schemas）。
 *
 * 取引は calc 系と同じくクライアント所有の全年度分を寛容に受け
 * （正規化は @etax/shared の normalizeTransactions が担う）、対象年への
 * 絞り込みはサーバー側で行う（DB不要・ステートレス）。filing_type は
 * 申告画面の設定と揃えるための任意指定で、青色申告特別控除の配分に使う。
 */
import { z } from "@hono/zod-openapi";
import { BalanceSheetInputSchema } from "./etax";

export const CalculateTrialBalanceRequestSchema = z
  .object({
    transactions: z.unknown().optional(),
    /** 対象年。小数は切り捨てて使う。 */
    year: z.number().min(1),
    filing_type: z.enum(["blue65", "blue55", "blue10", "white"]).optional(),
    real_estate_business_scale: z.boolean().optional(),
    balance_sheet: BalanceSheetInputSchema.optional(),
  })
  .openapi("CalculateTrialBalanceRequest");
