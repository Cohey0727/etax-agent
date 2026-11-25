/**
 * agentChat.ts — 対話エージェントエンドポイントのスキーマ（schemas）。
 *
 * リクエスト検証はハンドラ側で行う（設定・APIキーゲートの 500/503 を
 * バリデーションの 400 より先に返す従来順序を保つため）。
 * messages の要素の検証（role/content の型）は従来どおりハンドラで
 * フィルタするので、ここでは配列であることだけを要求する。
 * csvText は文字列でない値を未指定として扱う（z.catch）。
 */
import { z } from "@hono/zod-openapi";

/**
 * チャット添付1件。画像・PDF は dataBase64、CSV は text で中身を送る。
 * 形式・サイズの検証は services/agent の validateChatAttachments が担う。
 */
export const AgentChatAttachmentSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    dataBase64: z.string().optional().catch(undefined),
    text: z.string().optional().catch(undefined),
  })
  .openapi("AgentChatAttachment");

export type AgentChatAttachment = z.infer<typeof AgentChatAttachmentSchema>;

export const AgentChatRequestSchema = z
  .object({
    messages: z.array(z.unknown()),
    transactions: z.unknown().optional(),
    csvText: z.string().optional().catch(undefined),
    // このターンに添付されたファイル（最後のユーザー発言へ付けて LLM へ渡す）。
    attachments: z.array(AgentChatAttachmentSchema).optional().catch(undefined),
    // 画面が保持する控除入力のスナップショット（対象年つき）。
    deductions: z
      .object({ year: z.number().int(), state: z.unknown() })
      .optional()
      .catch(undefined),
    // 設定画面（外部接続）からの上書き。空・欠落はサーバー設定を使う。
    agentConfig: z
      .object({
        apiKey: z.string().optional().catch(undefined),
        baseUrl: z.string().optional().catch(undefined),
        model: z.string().optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .openapi("AgentChatRequest");

export type AgentChatRequest = z.infer<typeof AgentChatRequestSchema>;

export const ToolCallLogSchema = z
  .object({
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    result: z.unknown(),
  })
  .openapi("ToolCallLog");

export const AgentChatResponseSchema = z
  .object({
    reply: z.string(),
    toolCalls: z.array(ToolCallLogSchema),
  })
  .openapi("AgentChatResponse");

export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>;
