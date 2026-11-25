/**
 * llmGateway.ts — LLM API（外部サービス）への唯一の接続点（gateways）。
 *
 * 外部APIの呼び方（CODING_CONVENTIONS_BACKEND「Gateways」）の選択理由:
 *   本ゲートウェイの接続先は AGENT_BASE_URL で差し替え可能な任意の
 *   OpenAI互換エンドポイント（OpenRouter / OpenCode Zen 等）と
 *   Anthropic Messages API の2系統であり、差し替え先ごとに公式SDKは
 *   存在しない（特に OpenCode Zen に公式SDK・OpenAPIスキーマはない）。
 *   よって規約の第3選択肢「fetch で呼び、応答は zod で検証する」を採用し、
 *   応答エンベロープは本ファイル内の zod スキーマで検証してから使う。
 *
 * 内部の会話形式は OpenAI スタイルに統一する:
 *   messages: [{role, content, tool_calls?, tool_call_id?, name?}, ...]
 *   tools   : OpenAI 形式 [{type:"function", function:{name, description, parameters}}]
 *
 * chat() の戻り値（正規化済み）:
 *   { content: string, toolCalls: [{id, name, arguments(dict)}] }
 *
 *   - openai スキーマ: POST {base_url}/chat/completions（OpenRouter / OpenCode 互換）
 *   - claude スキーマ: POST {base_url}/v1/messages（Anthropic Messages API）
 *                      tool_use / tool_result 形式へ相互変換する。
 *
 * 送信ヘッダーの注意（互換性要件）:
 *   - User-Agent はランタイム既定値だと Cloudflare に弾かれる
 *     （error 1010）ため 'etax-agent/0.1' を明示する。
 *   - OpenCode Go は x-opencode-session ヘッダーが無いリクエストを拒否する
 *     （MissingSessionID）ため、OpenAI互換では常に送る。他のエンドポイントでは無視される。
 */
import { z } from "@hono/zod-openapi";
import { AgentConfig } from "../lib/config";

/** LLM 呼び出しの失敗を表す例外。instanceof 判定のための慣用としてクラスで定義する。 */
export class LLMError extends Error {}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatImage {
  mimeType: string;
  /** Base64（data: プレフィックスなし）。 */
  dataBase64: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** user メッセージに添付する画像（領収書の読み取りなど）。 */
  images?: ChatImage[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface LLMClient {
  chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<ChatResult>;
}

const USER_AGENT = "etax-agent/0.1";

/** OpenAI互換 Chat Completions 応答のエンベロープ（使う部分だけを検証する）。 */
const openAiChatCompletionSchema = z.looseObject({
  choices: z.array(
    z.looseObject({
      message: z
        .looseObject({
          content: z.unknown().optional(),
          tool_calls: z.unknown().optional(),
        })
        .optional(),
    }),
  ),
});

/** Anthropic Messages 応答のエンベロープ（使う部分だけを検証する）。 */
const anthropicMessagesSchema = z.looseObject({
  content: z
    .array(
      z.looseObject({
        // type を欠くブロックは空文字として読み、後段の分岐で読み飛ばす
        type: z.string().catch(""),
        text: z.unknown().optional(),
        id: z.unknown().optional(),
        name: z.unknown().optional(),
        input: z.unknown().optional(),
      }),
    )
    .catch([]),
});

/**
 * JSON を POST し、応答 JSON をオブジェクトとして返す。
 * 接続失敗・HTTPエラーは LLMError にする。
 */
async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new LLMError(`接続失敗 ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!resp.ok) {
    // 上流のエラー本文はクライアントへ反射しない（内部情報の漏洩防止）。
    // 運用調査用にサーバーログへだけ残す。
    const body = (await resp.text()).slice(0, 500);
    console.warn(`LLM 上流エラー HTTP ${resp.status} ${url}: ${body}`);
    throw new LLMError(`HTTP ${resp.status} ${url}: 上流サービスがエラーを返しました`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// OpenAI 互換（OpenRouter / OpenCode 等）
// ---------------------------------------------------------------------------

class OpenAICompatibleLLM implements LLMClient {
  private sessionId = crypto.randomUUID();
  constructor(private config: AgentConfig) {}

  /** 1回の Chat Completions 呼び出しを行い、内部形式へ正規化して返す。 */
  async chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<ChatResult> {
    const apiKey = this.config.requireKey();
    const payload: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => {
        const out: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.images && m.images.length > 0) {
          // 画像つきメッセージは content をパート配列にする（OpenAI 形式）
          out["content"] = [
            { type: "text", text: m.content },
            ...m.images.map((image) => ({
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` },
            })),
          ];
        }
        if (m.tool_calls) {
          out["tool_calls"] = m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));
        }
        if (m.tool_call_id) out["tool_call_id"] = m.tool_call_id;
        if (m.name) out["name"] = m.name;
        return out;
      }),
    };
    if (tools) payload["tools"] = tools;
    const data = await httpPostJson(
      `${this.config.baseUrl}/chat/completions`,
      {
        Authorization: `Bearer ${apiKey}`,
        // OpenCode Go は x-opencode-session ヘッダ必須。他の互換先では無視される。
        "x-opencode-session": this.sessionId,
      },
      payload,
    );
    const envelope = openAiChatCompletionSchema.safeParse(data);
    const msg = envelope.success ? envelope.data.choices[0]?.message : undefined;
    if (!msg) {
      // 応答本文はクライアントへ反射しない。
      console.warn(`LLM 応答形式が想定外です: ${JSON.stringify(data).slice(0, 500)}`);
      throw new LLMError("応答形式が想定外です");
    }
    const toolCalls: ToolCall[] = [];
    const rawCalls = (msg.tool_calls as Array<Record<string, unknown>> | undefined) ?? [];
    for (const tc of rawCalls) {
      const fn = (tc["function"] as Record<string, unknown> | undefined) ?? {};
      const argsRaw = fn["arguments"] ?? "{}";
      let args: Record<string, unknown>;
      if (typeof argsRaw === "string") {
        try {
          args = JSON.parse(argsRaw) as Record<string, unknown>;
        } catch {
          args = { _raw: argsRaw };
        }
      } else {
        args = argsRaw as Record<string, unknown>;
      }
      toolCalls.push({
        id: typeof tc["id"] === "string" ? tc["id"] : "",
        name: typeof fn["name"] === "string" ? fn["name"] : "",
        arguments: args,
      });
    }
    return { content: typeof msg.content === "string" ? msg.content : "", toolCalls };
  }
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

class ClaudeLLM implements LLMClient {
  private static ANTHROPIC_VERSION = "2023-06-01";
  constructor(private config: AgentConfig) {}

  /** 内部形式 → Anthropic 形式への変換 */
  private convert(messages: ChatMessage[], tools?: ToolDef[]) {
    const systemParts: string[] = [];
    const conv: Array<Record<string, unknown>> = [];
    for (const m of messages) {
      if (m.role === "system") {
        if (m.content) systemParts.push(m.content);
      } else if (m.role === "user") {
        if (m.images && m.images.length > 0) {
          conv.push({
            role: "user",
            content: [
              ...m.images.map((image) => ({
                type: "image",
                source: { type: "base64", media_type: image.mimeType, data: image.dataBase64 },
              })),
              { type: "text", text: m.content },
            ],
          });
        } else {
          conv.push({ role: "user", content: m.content });
        }
      } else if (m.role === "assistant") {
        const blocks: Array<Record<string, unknown>> = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls ?? []) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
        }
        conv.push({ role: "assistant", content: blocks.length > 0 ? blocks : "" });
      } else if (m.role === "tool") {
        conv.push({
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content },
          ],
        });
      }
    }
    const anthropicTools = tools
      ? tools.map((t) => ({
          name: t.function.name,
          description: t.function.description ?? "",
          input_schema: t.function.parameters ?? { type: "object", properties: {} },
        }))
      : undefined;
    return { system: systemParts.join("\n\n"), conv, anthropicTools };
  }

  /** 1回の Messages 呼び出しを行い、内部形式へ正規化して返す。 */
  async chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<ChatResult> {
    const apiKey = this.config.requireKey();
    const { system, conv, anthropicTools } = this.convert(messages, tools);
    const payload: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 4096,
      messages: conv,
    };
    if (system) payload["system"] = system;
    if (anthropicTools) payload["tools"] = anthropicTools;
    const data = await httpPostJson(
      `${this.config.baseUrl}/v1/messages`,
      { "x-api-key": apiKey, "anthropic-version": ClaudeLLM.ANTHROPIC_VERSION },
      payload,
    );
    const envelope = anthropicMessagesSchema.safeParse(data);
    const content = envelope.success
      ? envelope.data.content
      : (data["content"] as Array<Record<string, unknown>> | undefined) ?? [];
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(typeof block.text === "string" ? block.text : "");
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: typeof block.id === "string" ? block.id : "",
          name: typeof block.name === "string" ? block.name : "",
          arguments: (block.input as Record<string, unknown> | undefined) ?? {},
        });
      }
    }
    return { content: textParts.join(""), toolCalls };
  }
}

/** 設定のスキーマに応じて LLM クライアントを作る（gateways の入口）。 */
export function createLlmClient(config: AgentConfig): LLMClient {
  if (config.schema === "claude") return new ClaudeLLM(config);
  return new OpenAICompatibleLLM(config);
}
