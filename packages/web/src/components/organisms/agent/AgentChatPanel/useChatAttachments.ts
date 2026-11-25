import { useState } from "react";
import {
  MAX_CHAT_ATTACHMENTS,
  PendingAttachment,
  readAttachment,
} from "./chatAttachments";

/**
 * 送信前の添付ファイルの保持・追加・取り消し。
 * 読み込みや検証の失敗は reportError へ日本語の理由を渡す。
 */
export const useChatAttachments = (reportError: (message: string) => void) => {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const added: PendingAttachment[] = [];
    for (const file of list) {
      if (pending.length + added.length >= MAX_CHAT_ATTACHMENTS) {
        reportError(`添付ファイルは${MAX_CHAT_ATTACHMENTS}件までです`);
        break;
      }
      try {
        added.push(await readAttachment(file));
      } catch (e) {
        reportError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    if (added.length > 0) setPending((prev) => [...prev, ...added]);
  };

  const removeFile = (id: string) =>
    setPending((prev) => prev.filter((file) => file.id !== id));

  const clear = () => setPending([]);

  return { pending, addFiles, removeFile, clear };
};
