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
    source: z.enum(["history", "generated", "systemone", "rules", "none"]),
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

export const GeneratedRegexRuleSchema = z
  .object({
    pattern: z.string(),
    category: z.string(),
    count: z.number(),
    example: z.string(),
  })
  .openapi("GeneratedRegexRule");

export const GeneratedRulesResponseSchema = z
  .object({
    regexRules: z.array(GeneratedRegexRuleSchema),
    jevPrompt: z.string(),
  })
  .openapi("GeneratedRulesResponse");

export type GeneratedRulesResponse = z.infer<typeof GeneratedRulesResponseSchema>;

export const ClassificationHistoryEntrySchema = z
  .object({
    description: z.string(),
    account: z.string(),
    count: z.number(),
    updatedAt: z.string(),
  })
  .openapi("ClassificationHistoryEntry");

export const ClassificationHistoryResponseSchema = z
  .object({
    records: z.array(ClassificationHistoryEntrySchema),
    total: z.number(),
  })
  .openapi("ClassificationHistoryResponse");

export type ClassificationHistoryResponse = z.infer<typeof ClassificationHistoryResponseSchema>;

export const JevPromptResponseSchema = z
  .object({
    /** 設定画面で手編集されたプロンプト（未設定なら空文字）。 */
    customPrompt: z.string(),
    /** 学習履歴から自動生成されるプロンプト。 */
    generatedPrompt: z.string(),
    /** 実際に判定へ使われるプロンプト（カスタムがあればそちら）。 */
    effectivePrompt: z.string(),
  })
  .openapi("JevPromptResponse");

export type JevPromptResponse = z.infer<typeof JevPromptResponseSchema>;

export const UpdateJevPromptRequestSchema = z
  .object({
    /** 空文字で保存するとカスタムを消して自動生成に戻る。 */
    prompt: z.string().max(8000),
  })
  .openapi("UpdateJevPromptRequest");
