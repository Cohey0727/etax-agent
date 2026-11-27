/**
 * filingStatus.ts — 申告ステータスエンドポイントのスキーマ（schemas）。
 *
 * ステータスは年度ごとに「確認・控除計算・提出」の3つの済み状態を持ち、
 * 各状態は済ませた日時（ISO文字列）とセットで返す。未了は null。
 */
import { z } from "@hono/zod-openapi";
import { YearSchema } from "./common";

export const FilingStatusSchema = z
  .object({
    year: z.number(),
    confirmed: z.boolean(),
    confirmed_at: z.string().nullable(),
    calculated: z.boolean(),
    calculated_at: z.string().nullable(),
    submitted: z.boolean(),
    submitted_at: z.string().nullable(),
  })
  .openapi("FilingStatus");

export type FilingStatusResponse = z.infer<typeof FilingStatusSchema>;

export const ListFilingStatusesResponseSchema = z
  .object({
    statuses: z.array(FilingStatusSchema),
  })
  .openapi("FilingStatusList");

export type ListFilingStatusesResponse = z.infer<typeof ListFilingStatusesResponseSchema>;

export const SingleFilingStatusResponseSchema = z
  .object({
    status: FilingStatusSchema,
  })
  .openapi("SingleFilingStatus");

export type SingleFilingStatusResponse = z.infer<typeof SingleFilingStatusResponseSchema>;

export const FilingStatusYearParamSchema = z
  .object({
    year: YearSchema,
  })
  .openapi("FilingStatusYearParam");

export const UpdateFilingStatusRequestSchema = z
  .object({
    confirmed: z.boolean().optional(),
    calculated: z.boolean().optional(),
    submitted: z.boolean().optional(),
  })
  .openapi("UpdateFilingStatusRequest");

export type UpdateFilingStatusRequest = z.infer<typeof UpdateFilingStatusRequestSchema>;
