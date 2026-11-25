import { z } from "zod";
import { BalanceSheetInputSchema } from "./etax";

/**
 * 試算表レポートのリクエスト（Issue #18）。
 * 取引は calc 系と同じくクライアント所有の全年度分を受け、対象年への
 * 絞り込みはサーバー側で行う（stateless）。filing_type は申告画面の
 * 設定と揃えるための任意指定で、青色申告特別控除の配分に使う。
 */
export const CalculateTrialBalanceRequestSchema = z
  .object({
    transactions: z.unknown().optional(),
    year: z.unknown().optional(),
    filing_type: z.enum(["blue65", "blue55", "blue10", "white"]).optional(),
    real_estate_business_scale: z.boolean().optional(),
    balance_sheet: BalanceSheetInputSchema.optional(),
  })
  .openapi("CalculateTrialBalanceRequest");
