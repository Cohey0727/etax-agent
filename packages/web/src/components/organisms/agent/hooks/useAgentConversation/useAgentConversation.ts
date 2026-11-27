import { AgentUiAction, deriveUiActions, Transaction } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { AgentConnectionConfig, ChatMessage, ChatRole } from "@types";
import { agentChat, loadCurrentMessages, saveCurrentMessages } from "@utils";
import { PendingAttachment, toChatAttachmentUpload } from "../../AgentChatPanel/chatAttachments";

export interface AgentConversationOptions {
  transactions: Transaction[];
  /** 外部接続（AI）の上書き設定（設定画面で入力、AppPage が保持） */
  agentConnection: AgentConnectionConfig;
  /** 送信時点の控除入力スナップショットを返す（エージェントの控除ツール用）。 */
  getDeductionsSnapshot: () => { year: number; state: unknown } | null;
  /** エージェントが代行する画面操作を実行する。 */
  onUiAction: (action: AgentUiAction) => void;
  /** クリア時に現在の会話を履歴へ保存する。 */
  onArchive: (messages: ChatMessage[]) => void;
}

/**
 * 応答を待つ上限。サーバーはツール呼び出しを挟んで AI を最大10回呼ぶ。これを超えて
 * 返らないものは止まっているとみなし、チャットを使える状態に戻す。
 */
const AGENT_REPLY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * エージェントとの会話（発言・応答待ち・エラー）と、送信・中断・クリア。
 * クリアのボタンはパネルの外（見出しの履歴の隣）に置くため、会話はパネルではなく
 * AppPage が持つ。会話は端末に保存し、再読み込みしても続きから使えるようにする。
 */
export function useAgentConversation(options: AgentConversationOptions) {
  const { transactions, agentConnection, getDeductionsSnapshot, onUiAction, onArchive } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadCurrentMessages());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 応答待ちの送信（中断ボタン・時間切れで止める）。送信と中断のイベントの中でだけ書く。
  const pendingRequestRef = useRef<AbortController | null>(null);

  // 画面が閉じたら応答待ちをやめる。
  useEffect(() => () => pendingRequestRef.current?.abort("user"), []);

  const send = async (text: string, attachments: PendingAttachment[]) => {
    if ((!text && attachments.length === 0) || loading) return;
    // 添付だけの送信もできるよう、本文が空なら定型文を入れる。
    const userMessage: ChatMessage = {
      role: ChatRole.User,
      content: text || "添付ファイルを確認してください。",
      ...(attachments.length > 0
        ? { attachments: attachments.map(({ name, mimeType }) => ({ name, mimeType })) }
        : {}),
    };
    const next: ChatMessage[] = [...messages, userMessage];
    setMessages(next);
    saveCurrentMessages(next);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    pendingRequestRef.current = controller;
    const timer = setTimeout(() => controller.abort("timeout"), AGENT_REPLY_TIMEOUT_MS);
    try {
      const res = await agentChat(
        next,
        transactions,
        agentConnection,
        getDeductionsSnapshot() ?? undefined,
        attachments.map(toChatAttachmentUpload),
        controller.signal,
      );
      // 使ったツールは発言に添えて表示する（何をしたか分かるように）。
      const answered: ChatMessage[] = [
        ...next,
        {
          role: ChatRole.Assistant,
          content: res.reply,
          ...(res.toolCalls.length > 0
            ? {
                toolCalls: res.toolCalls.map((tc) => ({
                  name: tc.name,
                  arguments: tc.arguments,
                })),
              }
            : {}),
        },
      ];
      setMessages(answered);
      saveCurrentMessages(answered);
      for (const action of deriveUiActions(res.toolCalls)) onUiAction(action);
    } catch (e) {
      if (controller.signal.reason === "account") {
        // ログインし直したアカウントの画面に、前のアカウントの送信の結果を出さない
      } else if (controller.signal.aborted) {
        // 画面が待つのをやめても、サーバー側の処理は続いて保存まで済む場合がある
        setError(
          controller.signal.reason === "timeout"
            ? "応答がないため待つのをやめました。処理はサーバーで続いている場合があります。"
            : "応答を待つのをやめました。処理はサーバーで続いている場合があります。",
        );
      } else {
        // 503（キー未設定）などは案内としてそのまま見せる
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      clearTimeout(timer);
      pendingRequestRef.current = null;
      setLoading(false);
    }
  };

  const stopWaiting = () => {
    pendingRequestRef.current?.abort("user");
  };

  // クリア = いまの会話を履歴へ保存してから空にする（履歴から後で見返せる）。
  const clear = () => {
    if (messages.length === 0) return;
    onArchive(messages);
    setMessages([]);
    saveCurrentMessages([]);
  };

  /**
   * ログインしたアカウントの会話を読み直す（端末保存はアカウントごとに分かれており、
   * ログインの確認が終わるまでどのアカウントの会話かが決まらない）。前のアカウントの
   * 応答待ちはやめる。
   */
  const reloadForAccount = () => {
    pendingRequestRef.current?.abort("account");
    setMessages(loadCurrentMessages());
    setError(null);
  };

  return { messages, loading, error, send, stopWaiting, clear, reloadForAccount };
}
