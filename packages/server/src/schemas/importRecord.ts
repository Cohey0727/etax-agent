/**
 * importRecord.ts — 取込履歴エンドポイントのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const ImportRecordSchema = z
  .object({
    id: z.number(),
    filename: z.string().nullable(),
    sourceName: z.string().nullable(),
    mapping: z.unknown(),
    rowCount: z.number(),
    createdAt: z.string(),
  })
  .openapi("ImportRecord");

export type ImportRecordResponse = z.infer<typeof ImportRecordSchema>;

export const ListImportsResponseSchema = z
  .object({
    count: z.number(),
    imports: z.array(ImportRecordSchema),
  })
  .openapi("ImportRecordList");

export type ListImportsResponse = z.infer<typeof ListImportsResponseSchema>;
