/**
 * agentAttachments.ts — チャット添付を LLM へ渡す形へ変換する（services/agent）。
 *
 * 対応形式はサーバーが実際に処理できるものだけに限る:
 *   - 画像（JPEG/PNG/WebP/GIF）: 領収書解析と同じ許可値。マルチモーダルの image パートで渡す。
 *   - PDF: file パートで渡す（Anthropic / OpenAI 系はどちらも対応）。
 *   - CSV（text/csv）: テキストとしてメッセージに同梱する。1件だけなら
 *     csvText（import_csv_info ツールが読む）にも載せる。
 * 検証（件数・サイズ・形式）はここに集約し、usecases 側は呼ぶだけにする。
 */
import { FilePart, ImagePart, ModelMessage, TextPart } from "ai";

/** チャット添付1件（リクエストの attachments 要素と同形）。 */
export interface AgentChatAttachment {
  name: string;
  mimeType: string;
  /** 画像・PDF の中身（Base64）。CSV では使わない。 */
  dataBase64?: string;
  /** CSV の中身（テキスト）。画像・PDF では使わない。 */
  text?: string;
}

type AttachmentKind = "image" | "pdf" | "csv";

/** MIME タイプ → 添付の種別。ここに無い形式は受け付けない。 */
const ATTACHMENT_KIND_BY_MIME: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "text/csv": "csv",
};

/** 添付の上限（件数と1件あたりのサイズ）。 */
export const MAX_CHAT_ATTACHMENTS = 5;
const MAX_DATA_BASE64_LENGTH = 14_000_000; // バイナリで約10MB
const MAX_TEXT_LENGTH = 1_000_000;

/** 添付の検証。不正なら理由を Error で投げる（usecases が 400 に変換する）。 */
export function validateChatAttachments(attachments: AgentChatAttachment[]): void {
  if (attachments.length > MAX_CHAT_ATTACHMENTS) {
    throw new Error(`添付ファイルは${MAX_CHAT_ATTACHMENTS}件までです`);
  }
  for (const attachment of attachments) {
    const kind = ATTACHMENT_KIND_BY_MIME[attachment.mimeType];
    if (!kind) {
      throw new Error(
        `対応していないファイル形式です: ${attachment.name}（${attachment.mimeType}）。画像（JPEG/PNG/WebP/GIF）・PDF・CSV が添付できます`,
      );
    }
    if (kind === "csv") {
      if (!attachment.text) {
        throw new Error(`CSV の内容を読み取れませんでした: ${attachment.name}`);
      }
      if (attachment.text.length > MAX_TEXT_LENGTH) {
        throw new Error(`CSV が大きすぎます（上限 ${MAX_TEXT_LENGTH} 文字）: ${attachment.name}`);
      }
    } else {
      if (!attachment.dataBase64) {
        throw new Error(`ファイルの内容を読み取れませんでした: ${attachment.name}`);
      }
      if (attachment.dataBase64.length > MAX_DATA_BASE64_LENGTH) {
        throw new Error(`ファイルが大きすぎます（上限 約10MB）: ${attachment.name}`);
      }
    }
  }
}

/**
 * CSV 添付が1件だけのとき、そのテキストを返す（csvText 経路に載せるため）。
 * 複数あるときはメッセージ同梱のみとし、ツール経路には載せない。
 */
export function singleCsvText(attachments: AgentChatAttachment[]): string | undefined {
  const csvs = attachments.filter((a) => ATTACHMENT_KIND_BY_MIME[a.mimeType] === "csv");
  return csvs.length === 1 ? csvs[0]?.text : undefined;
}

type UserContentPart = TextPart | ImagePart | FilePart;

/** ユーザー発言の本文＋添付を、AI SDK のユーザーメッセージ内容へ組み立てる。 */
export function buildUserContent(
  text: string,
  attachments: AgentChatAttachment[],
): string | UserContentPart[] {
  if (attachments.length === 0) return text;
  const binaryNames = attachments
    .filter((a) => ATTACHMENT_KIND_BY_MIME[a.mimeType] !== "csv")
    .map((a) => a.name);
  const head =
    binaryNames.length > 0 ? `${text}\n（添付ファイル: ${binaryNames.join("、")}）` : text;
  const parts: UserContentPart[] = [{ type: "text", text: head }];
  for (const attachment of attachments) {
    const kind = ATTACHMENT_KIND_BY_MIME[attachment.mimeType];
    if (kind === "csv") {
      parts.push({
        type: "text",
        text: `--- 添付ファイル「${attachment.name}」（CSV）の内容 ---\n${attachment.text ?? ""}`,
      });
    } else if (kind === "image") {
      parts.push({ type: "image", image: attachment.dataBase64 ?? "" });
    } else if (kind === "pdf") {
      parts.push({
        type: "file",
        data: attachment.dataBase64 ?? "",
        mediaType: "application/pdf",
        filename: attachment.name,
      });
    }
  }
  return parts;
}

/** 会話履歴を AI SDK のメッセージ列にし、添付は最後のユーザー発言へ付ける。 */
export function toModelMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  attachments: AgentChatAttachment[],
): ModelMessage[] {
  const messages: ModelMessage[] = history.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content },
  );
  if (attachments.length === 0) return messages;
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex < 0) {
    return [...messages, { role: "user", content: buildUserContent("", attachments) }];
  }
  const next = [...messages];
  const target = next[lastUserIndex];
  if (target && target.role === "user" && typeof target.content === "string") {
    next[lastUserIndex] = {
      role: "user",
      content: buildUserContent(target.content, attachments),
    };
  }
  return next;
}
