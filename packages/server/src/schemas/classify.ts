/**
 * classify.ts — 科目判定APIのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const AccountCandidateSchema = z
  .object({
    account: z.string(),
    probability: z.number(),
  })
  .openapi("AccountCandidate");

export const AccountClassificationSchema = z
  .object({
    account: z.string(),
    confidence: z.number().nullable(),
    source: z.enum(["history", "systemone", "rules", "none"]),
    candidates: z.array(AccountCandidateSchema),
  })
  .openapi("AccountClassification");

export type AccountClassificationResponse = z.infer<typeof AccountClassificationSchema>;

export const ClassifyAccountRequestSchema = z
  .object({
    description: z.string().min(1),
    amount: z.number().optional(),
  })
  .openapi("ClassifyAccountRequest");

export const ClassifyAccountsBatchRequestSchema = z
  .object({
    items: z
      .array(
        z.object({
          description: z.string().min(1),
          amount: z.number().optional(),
        }),
      )
      .max(200),
  })
  .openapi("ClassifyAccountsBatchRequest");

export const ClassifyAccountsBatchResponseSchema = z
  .object({
    results: z.array(AccountClassificationSchema),
  })
  .openapi("ClassifyAccountsBatchResponse");

export type ClassifyAccountsBatchResponse = z.infer<typeof ClassifyAccountsBatchResponseSchema>;

export const RecordClassificationFeedbackRequestSchema = z
  .object({
    description: z.string().min(1),
    account: z.string().min(1),
  })
  .openapi("RecordClassificationFeedbackRequest");

export const RecordClassificationFeedbackResponseSchema = z
  .object({
    recorded: z.boolean(),
    totalRecords: z.number(),
  })
  .openapi("RecordClassificationFeedbackResponse");

export type RecordClassificationFeedbackResponse = z.infer<
  typeof RecordClassificationFeedbackResponseSchema
>;
