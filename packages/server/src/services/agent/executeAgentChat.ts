/**
 * executeAgentChat.ts — 対話エージェント実行の本体（services/agent）。
 *
 * REST（usecases/runAgentChat）と MCP（agent_chat ツール）が共用する。
 * 設定読込 → 接続情報の上書き → キー確認 → 入力検証 → runAgentTurn の
 * 順で処理する（入力検証より先に設定・キーのゲートを通し、未設定は
 * 503 を返す）。失敗は AgentChatError（REST の HTTP
 * ステータス相当つき）で表し、呼び出し側が表現に合わせて変換する。
 * 会話の実行自体は runAgentTurn が担う。
 */
import { normalizeTransactions } from "@etax/shared";
import {
  AgentConfig,
  ConfigError,
  loadAgentConfig,
  pairApiKeyWithBaseUrl,
} from "../../lib/config";
import { BusinessError, errorMessage } from "../../lib/errors";
import { assertSafeUserBaseUrl, UnsafeUrlError } from "../../lib/ssrfGuard";
import { AgentChatRequestSchema, AgentChatResponse } from "../../schemas/agentChat";
import { singleCsvText, validateChatAttachments } from "./agentAttachments";
import { runAgentTurn } from "./runAgentTurn";

/** エージェント実行の失敗。status は REST 側の HTTP ステータスに対応する。 */
export class AgentChatError extends BusinessError {}

interface AgentConfigOverride {
  apiKey?: unknown;
  baseUrl?: unknown;
  model?: unknown;
}

/**
 * 対話エージェントを1ターン実行する。raw は REST のリクエストボディと
 * 同じ形（messages / transactions / attachments / csvText / deductions /
 * agentConfig）。検証はここで行う。
 */
export async function executeAgentChat(raw: unknown): Promise<AgentChatResponse> {
  let cfg: AgentConfig;
  try {
    cfg = loadAgentConfig();
  } catch (e) {
    throw new AgentChatError(500, errorMessage(e));
  }
  const body = (typeof raw === "object" && raw !== null ? raw : null) as
    | Record<string, unknown>
    | null;
  // 設定画面（外部接続）から送られた接続情報があれば、環境変数より優先する。
  // ただし baseUrl がカスタム宛先の場合、サーバー環境変数のキーは送らない
  // （キー漏洩防止: pairApiKeyWithBaseUrl）。カスタム宛先は SSRF 検証も行う。
  const override = body?.["agentConfig"] as AgentConfigOverride | undefined;
  if (override) {
    const customBaseUrl =
      typeof override.baseUrl === "string" && override.baseUrl.trim()
        ? override.baseUrl.trim()
        : null;
    const userKey =
      typeof override.apiKey === "string" && override.apiKey.trim()
        ? override.apiKey.trim()
        : null;
    if (customBaseUrl) {
      try {
        await assertSafeUserBaseUrl(customBaseUrl);
      } catch (e) {
        if (e instanceof UnsafeUrlError) {
          throw new AgentChatError(400, e.message);
        }
        throw e;
      }
    }
    const paired = pairApiKeyWithBaseUrl({
      customBaseUrl,
      serverBaseUrl: cfg.baseUrl,
      userKey,
      serverKey: cfg.apiKey,
    });
    cfg.baseUrl = paired.baseUrl;
    cfg.apiKey = paired.apiKey;
    if (typeof override.model === "string" && override.model.trim()) {
      cfg.model = override.model.trim();
    }
  }
  if (!cfg.apiKey) {
    throw new AgentChatError(
      503,
      "AGENT_API_KEY が未設定のためエージェントは利用できません。サーバーの環境変数に AGENT_API_KEY を設定するか、設定画面の「外部接続」にAPIキーを入力してください（集計・計算・CSV取込はキー不要で使えます）。",
    );
  }
  const parsed = body === null ? null : AgentChatRequestSchema.safeParse(body);
  if (!parsed || !parsed.success) {
    throw new AgentChatError(400, "messages 配列が必要です");
  }
  const data = parsed.data;
  const history = (data.messages as unknown[])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        typeof m === "object" &&
        m !== null &&
        ((m as { role?: unknown }).role === "user" ||
          (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content }));
  const transactions = normalizeTransactions(data.transactions ?? []);
  const attachments = data.attachments ?? [];
  try {
    validateChatAttachments(attachments);
  } catch (e) {
    throw new AgentChatError(400, errorMessage(e));
  }
  // CSV 添付が1件だけなら、csvText（import_csv_info が読む）にも載せる。
  const csvText = data.csvText ?? singleCsvText(attachments);
  const deductions = data.deductions;
  try {
    return await runAgentTurn(cfg, history, { transactions, csvText, deductions }, attachments);
  } catch (e) {
    if (e instanceof ConfigError) throw new AgentChatError(503, errorMessage(e));
    // AI SDK 経由の LLM 呼び出し失敗（HTTPエラー・接続失敗・応答形式異常）は 502。
    throw new AgentChatError(502, errorMessage(e));
  }
}
