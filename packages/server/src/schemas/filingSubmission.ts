/**
 * filingSubmission.ts — 提出の記録（受付番号・受信通知PDF）エンドポイントの
 * スキーマ（schemas）。
 *
 * 記録は年度×税目（income = 所得税 / consumption = 消費税）ごとに1件。
 * 受付番号が記録されると申告ステータスの「提出済み」と連動する。
 */
import { z } from "@hono/zod-openapi";
import { YearSchema } from "./common";

/** 税目。income = 所得税、consumption = 消費税。 */
export const FilingSubmissionKindSchema = z.enum(["income", "consumption"]);

export type FilingSubmissionKind = z.infer<typeof FilingSubmissionKindSchema>;

export const FilingSubmissionSchema = z
  .object({
    year: z.number(),
    kind: FilingSubmissionKindSchema,
    /** 受信通知の受付番号。未記録なら空文字 */
    acceptance_number: z.string(),
    /** 提出日 YYYY-MM-DD。未記録なら null */
    submitted_date: z.string().nullable(),
    /** 受信通知PDF。未添付なら null */
    receipt: z
      .object({
        file_id: z.string(),
        mime_type: z.string(),
      })
      .nullable(),
    updated_at: z.string(),
  })
  .openapi("FilingSubmission");

export type FilingSubmissionResponse = z.infer<typeof FilingSubmissionSchema>;

export const ListFilingSubmissionsResponseSchema = z
  .object({
    submissions: z.array(FilingSubmissionSchema),
  })
  .openapi("FilingSubmissionList");

export type ListFilingSubmissionsResponse = z.infer<typeof ListFilingSubmissionsResponseSchema>;

export const SingleFilingSubmissionResponseSchema = z
  .object({
    submission: FilingSubmissionSchema,
  })
  .openapi("SingleFilingSubmission");

export type SingleFilingSubmissionResponse = z.infer<
  typeof SingleFilingSubmissionResponseSchema
>;

export const FilingSubmissionYearParamSchema = z
  .object({
    year: YearSchema,
  })
  .openapi("FilingSubmissionYearParam");

export const FilingSubmissionKindParamSchema = z
  .object({
    year: YearSchema,
    kind: FilingSubmissionKindSchema,
  })
  .openapi("FilingSubmissionKindParam");

export const SaveFilingSubmissionRequestSchema = z
  .object({
    /** 受信通知の受付番号（空文字で記録を消す）。 */
    acceptance_number: z.string().max(64),
    /** 提出日 YYYY-MM-DD。未記録なら null */
    submitted_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .openapi("SaveFilingSubmissionRequest");

export type SaveFilingSubmissionRequest = z.infer<typeof SaveFilingSubmissionRequestSchema>;

export const AttachFilingReceiptRequestSchema = z
  .object({
    /** アップロード時に発行されたファイルID。 */
    file_id: z.string().min(1),
  })
  .openapi("AttachFilingReceiptRequest");

export type AttachFilingReceiptRequest = z.infer<typeof AttachFilingReceiptRequestSchema>;

/** 提出の記録の変更履歴1件（登録・更新・削除の記録）。 */
export const FilingSubmissionHistoryEntrySchema = z
  .object({
    id: z.number(),
    year: z.number(),
    kind: FilingSubmissionKindSchema,
    /** created / updated / deleted */
    action: z.string(),
    before: FilingSubmissionSchema.nullable(),
    after: FilingSubmissionSchema.nullable(),
    created_at: z.string(),
  })
  .openapi("FilingSubmissionHistoryEntry");

export type FilingSubmissionHistoryEntryResponse = z.infer<
  typeof FilingSubmissionHistoryEntrySchema
>;

export const ListFilingSubmissionHistoryResponseSchema = z
  .object({
    count: z.number(),
    history: z.array(FilingSubmissionHistoryEntrySchema),
  })
  .openapi("FilingSubmissionHistoryList");

export type ListFilingSubmissionHistoryResponse = z.infer<
  typeof ListFilingSubmissionHistoryResponseSchema
>;
