import { Icon } from "@components/atoms";
import { PendingAttachment } from "./chatAttachments";
import styles from "./AgentChatPanel.css";

export interface PendingAttachmentChipsProps {
  pending: PendingAttachment[];
  onRemove: (id: string) => void;
}

/** 送信前の添付ファイル一覧。チップごとに取り消せる。 */
export const PendingAttachmentChips = ({ pending, onRemove }: PendingAttachmentChipsProps) => {
  if (pending.length === 0) return null;
  return (
    <div className={styles.attachmentList}>
      {pending.map((file) => (
        <span key={file.id} className={styles.attachmentChip}>
          <Icon name="fileCheck" size={13} />
          <span className={styles.attachmentName}>{file.name}</span>
          <button
            type="button"
            className={styles.attachmentRemove}
            onClick={() => onRemove(file.id)}
            aria-label={`${file.name} を取り消す`}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  );
};
