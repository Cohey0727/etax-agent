/**
 * filingSubmission.ts — 提出の記録（受付番号・受信通知PDF）エンドポイントの
 * スキーマ（schemas）。Issue #28 Phase 1。
 *
 * 記録は年度×税目（income = 所得税 / consumption = 消費税）ごとに1件。
 * 受付番号が記録されると申告ステータスの「提出済み」と連動する。
 */
import { z } from "@hono/zod-openapi";

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
    year: z.string(),
  })
  .openapi("FilingSubmissionYearParam");

export const FilingSubmissionKindParamSchema = z
  .object({
    year: z.string(),
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

export const DeleteFilingSubmissionResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteFilingSubmissionResponse");

export type AttachFilingReceiptRequest = z.infer<typeof AttachFilingReceiptRequestSchema>;
