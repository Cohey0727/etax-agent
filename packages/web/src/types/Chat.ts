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

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** その発言でエージェントが使ったツール（助手の発言のみ）。 */
  toolCalls?: ChatToolCall[];
}

/**
 * チャットの送信キー（設定画面で切り替え）。
 * enter: Enterで送信（Shift+Enterで改行）。
 * modEnter: ⌘+Enter（WindowsはCtrl+Enter）で送信（Enterで改行）。
 * どちらのモードでも、日本語入力の変換確定Enterでは送信しない。
 */
export type SendKeyMode = "enter" | "modEnter";
