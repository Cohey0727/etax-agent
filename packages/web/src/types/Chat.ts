export const ChatRole = {
  User: "user",
  Assistant: "assistant",
} as const;

export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * チャットの送信キー（設定画面で切り替え）。
 * enter: Enterで送信（Shift+Enterで改行）。
 * modEnter: ⌘+Enter（WindowsはCtrl+Enter）で送信（Enterで改行）。
 * どちらのモードでも、日本語入力の変換確定Enterでは送信しない。
 */
export type SendKeyMode = "enter" | "modEnter";
