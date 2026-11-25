export const ChatRole = {
  User: "user",
  Assistant: "assistant",
} as const;

export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

/** エージェントが使ったツールの記録（助手の発言に添えて表示する）。 */
export interface ChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** チャットに添付したファイルの表示用参照（名前と形式だけ。実データは会話に保持しない）。 */
export interface ChatAttachmentRef {
  name: string;
  mimeType: string;
}

/** チャット送信時にサーバーへ渡す添付1件（画像・PDF は dataBase64、CSV は text）。 */
export interface ChatAttachmentUpload extends ChatAttachmentRef {
  dataBase64?: string;
  text?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** その発言でエージェントが使ったツール（助手の発言のみ）。 */
  toolCalls?: ChatToolCall[];
  /** その発言に添付したファイル（ユーザーの発言のみ、表示用）。 */
  attachments?: ChatAttachmentRef[];
}

/**
 * チャットの送信キー（設定画面で切り替え）。
 * enter: Enterで送信（Shift+Enterで改行）。
 * modEnter: ⌘+Enter（WindowsはCtrl+Enter）で送信（Enterで改行）。
 * どちらのモードでも、日本語入力の変換確定Enterでは送信しない。
 */
export type SendKeyMode = "enter" | "modEnter";
