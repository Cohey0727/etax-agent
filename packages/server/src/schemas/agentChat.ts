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

export const AgentChatRequestSchema = z
  .object({
    messages: z.array(z.unknown()),
    transactions: z.unknown().optional(),
    csvText: z.string().optional().catch(undefined),
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
