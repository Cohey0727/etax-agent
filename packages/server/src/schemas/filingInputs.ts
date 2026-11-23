/**
 * filingInputs.ts — 申告入力の取得・保存のスキーマ（schemas）。
 * state は画面側の DeductionState をそのまま運ぶ（形はクライアントが所有）。
 */
import { z } from "@hono/zod-openapi";

export const FilingInputsResponseSchema = z
  .object({
    year: z.number(),
    /** 保存済みの申告入力。未保存なら null */
    state: z.unknown().nullable(),
    updated_at: z.string().nullable(),
  })
  .openapi("FilingInputsResponse");

export const SaveFilingInputsRequestSchema = z
  .object({
    state: z.unknown().openapi({ description: "申告入力（DeductionState）" }),
  })
  .openapi("SaveFilingInputsRequest");
