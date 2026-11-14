/**
 * freee.ts — freee試算表データAPIのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const FreeeTrialBalanceAccountSchema = z
  .object({
    name: z.string(),
    category: z.string(),
    debit: z.number(),
    credit: z.number(),
    balance: z.number(),
  })
  .openapi("FreeeTrialBalanceAccount");

export const FreeeTrialBalanceYearSchema = z
  .object({
    year: z.number(),
    accounts: z.array(FreeeTrialBalanceAccountSchema),
  })
  .openapi("FreeeTrialBalanceYear");

export const FreeeTrialBalanceResponseSchema = z
  .object({
    source: z.string(),
    years: z.array(FreeeTrialBalanceYearSchema),
  })
  .openapi("FreeeTrialBalanceResponse");

export type FreeeTrialBalanceResponse = z.infer<typeof FreeeTrialBalanceResponseSchema>;
export type FreeeTrialBalanceYear = z.infer<typeof FreeeTrialBalanceYearSchema>;
