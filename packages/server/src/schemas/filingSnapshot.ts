/**
 * filingSnapshot.ts — 確定スナップショットエンドポイントのスキーマ（schemas）。
 *
 * 「控除・計算」を確定した時点の計算結果の控え。差し戻して再確定した
 * ときに直前の確定と比較するために、確定のたびに1件ずつ貯める。
 * 数字はすべて円単位の数値（文字列にしない）。
 */
import { z } from "@hono/zod-openapi";
import { YearSchema } from "./common";

export const FilingSnapshotFiguresSchema = z
  .object({
    business_income: z.number(),
    real_estate_income: z.number(),
    misc_income: z.number(),
    total_income: z.number(),
    total_deductions: z.number(),
    taxable_income: z.number(),
    final_tax: z.number(),
  })
  .openapi("FilingSnapshotFigures");

export type FilingSnapshotFigures = z.infer<typeof FilingSnapshotFiguresSchema>;

export const FilingSnapshotSchema = z
  .object({
    id: z.number(),
    year: z.number(),
    /** 確定した日時（ISO文字列） */
    confirmed_at: z.string(),
    figures: FilingSnapshotFiguresSchema,
  })
  .openapi("FilingSnapshot");

export type FilingSnapshotResponse = z.infer<typeof FilingSnapshotSchema>;

export const ListFilingSnapshotsResponseSchema = z
  .object({
    snapshots: z.array(FilingSnapshotSchema),
  })
  .openapi("FilingSnapshotList");

export type ListFilingSnapshotsResponse = z.infer<typeof ListFilingSnapshotsResponseSchema>;

export const CreateFilingSnapshotRequestSchema = z
  .object({
    figures: FilingSnapshotFiguresSchema,
  })
  .openapi("CreateFilingSnapshotRequest");

export type CreateFilingSnapshotRequest = z.infer<typeof CreateFilingSnapshotRequestSchema>;

export const FilingSnapshotYearParamSchema = z
  .object({
    year: YearSchema,
  })
  .openapi("FilingSnapshotYearParam");
