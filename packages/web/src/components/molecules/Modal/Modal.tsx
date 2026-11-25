import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Text } from "@components/atoms";
import styles from "./Modal.css";

export interface ModalProps {
  /** 開いているかどうか。閉じている間は何も描かない。 */
  open: boolean;
  /** ヘッダーに出す見出し。 */
  title?: ReactNode;
  /** 背景クリック・Esc・閉じるボタンで呼ばれる。 */
  onClose: () => void;
  children?: ReactNode;
}

/**
 * 中央にバウンスして現れる共通モーダル。
 * 背景クリックと Esc で閉じる。開いている間は背面のスクロールを止める。
 */
export const Modal = ({ open, title, onClose, children }: ModalProps) => {
  // Esc で閉じ、開いている間だけ背面スクロールを固定する。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // 祖先の transform があると position: fixed がずれるため body 直下へ描く（Drawer と同じ）。
  return createPortal(
    <div className={styles.root}>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.title}>
            {typeof title === "string" ? <Text variant="sectionTitle">{title}</Text> : title}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
};
