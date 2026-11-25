import { ReactNode, useEffect } from "react";
import { Button, Icon, Text } from "@components/atoms";
import styles from "./Drawer.css";

export interface DrawerProps {
  /** 開いているかどうか。閉じている間は何も描かない。 */
  open: boolean;
  /** ヘッダーに出す見出し。 */
  title?: ReactNode;
  /** 背景クリック・Esc・閉じるボタンで呼ばれる。 */
  onClose: () => void;
  children?: ReactNode;
}

/**
 * 右端からバウンスして滑り込む共通ドロワー。
 * 背景クリックと Esc で閉じる。開いている間は背面のスクロールを止める。
 */
export const Drawer = ({ open, title, onClose, children }: DrawerProps) => {
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

  return (
    <div className={styles.root}>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <aside className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.title}>
            {typeof title === "string" ? (
              <Text variant="sectionTitle">{title}</Text>
            ) : (
              title
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
};
