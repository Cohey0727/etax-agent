import { useRef, useState } from "react";
import {
  MAX_CHAT_ATTACHMENTS,
  PendingAttachment,
  readAttachment,
} from "../../AgentChatPanel/chatAttachments";

/**
 * 送信前の添付ファイルの保持・追加・取り消し。
 * 読み込みや検証の失敗は reportError へ日本語の理由を渡す。
 */
export const useChatAttachments = (reportError: (message: string) => void) => {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // 保持中＋読み込み中の件数。読み込みの途中にもう一度追加されても上限を超えないよう、
  // 読み込む前に枠を取る（追加・取り消し・クリアのイベントの中でだけ書く）。
  const reservedRef = useRef(0);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const accepted = list.slice(0, Math.max(MAX_CHAT_ATTACHMENTS - reservedRef.current, 0));
    reservedRef.current += accepted.length;
    const added: PendingAttachment[] = [];
    for (const file of accepted) {
      try {
        added.push(await readAttachment(file));
      } catch (e) {
        reportError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    if (accepted.length < list.length) {
      reportError(`添付ファイルは${MAX_CHAT_ATTACHMENTS}件までです`);
    }
    reservedRef.current -= accepted.length - added.length;
    if (added.length > 0) setPending((prev) => [...prev, ...added]);
  };

  const removeFile = (id: string) => {
    if (pending.some((file) => file.id === id)) reservedRef.current -= 1;
    setPending((prev) => prev.filter((file) => file.id !== id));
  };

  const clear = () => {
    reservedRef.current -= pending.length;
    setPending([]);
  };

  return { pending, addFiles, removeFile, clear };
};
