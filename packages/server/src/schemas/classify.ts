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
    source: z.enum(["generated", "systemone", "rules", "none"]),
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

export const RegexRuleSchema = z
  .object({
    pattern: z.string(),
    category: z.string(),
  })
  .openapi("RegexRule");

export const RegexRulesResponseSchema = z
  .object({
    /** 設定画面で手編集されたルール（未設定なら空配列）。 */
    customRules: z.array(RegexRuleSchema),
    /** カスタムルールが有効かどうか（有効なら実効ルールはカスタム）。 */
    usingCustom: z.boolean(),
    /** 学習履歴から自動生成されるルール。 */
    generatedRules: z.array(GeneratedRegexRuleSchema),
    /** 実際に判定へ使われるルール。 */
    effectiveRules: z.array(RegexRuleSchema),
  })
  .openapi("RegexRulesResponse");

export type RegexRulesResponse = z.infer<typeof RegexRulesResponseSchema>;

export const UpdateRegexRulesRequestSchema = z
  .object({
    /** 空配列で保存するとカスタムが消えて自動生成に戻る。 */
    rules: z.array(RegexRuleSchema).max(500),
  })
  .openapi("UpdateRegexRulesRequest");

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
