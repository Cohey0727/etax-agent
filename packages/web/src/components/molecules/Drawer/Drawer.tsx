import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Text } from "@components/atoms";
import styles from "./Drawer.css";

export interface DrawerProps {
  /** 開いているかどうか。閉じている間は何も描かない。 */
  open: boolean;
  /** ヘッダーに出す見出し。 */
  title?: ReactNode;
  /** 背景クリック・Esc・閉じるボタンで呼ばれる。 */
  onClose: () => void;
  /**
   * 重ねがけの段数。別の Drawer の中から開くときは下の段数より大きくする。
   * z-index が段数ごとに上がり、Esc は最前面の Drawer だけが受け取る。
   * @default 0
   */
  layer?: number;
  /** パネルの幅（CSS の width 値）。未指定なら既定幅。 */
  width?: string;
  children?: ReactNode;
}

// Drawer.css.ts の root の z-index と一致させる。
const BASE_Z_INDEX = 70;
const LAYER_Z_INDEX_STEP = 10;

// 開いている Drawer の重なり順（末尾が最前面）。Esc の配分に使う。
const drawerStack: symbol[] = [];

/**
 * 右端からバウンスして滑り込む共通ドロワー。
 * 背景クリックと Esc で閉じる。開いている間は背面のスクロールを止める。
 * Drawer の中から別の Drawer を開く場合は layer を上げて重ねる。
 */
export const Drawer = ({ open, title, onClose, layer = 0, width, children }: DrawerProps) => {
  const [instanceId] = useState(() => Symbol("drawer"));

  // 重なり順へ登録する（最前面の判定用）。
  useEffect(() => {
    if (!open) return;
    pushDrawer(instanceId);
    return () => removeDrawer(instanceId);
  }, [open, instanceId]);

  // Esc で閉じ、開いている間だけ背面スクロールを固定する。
  // Esc は最前面の Drawer だけが受け取り、下の Drawer は開いたままにする。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopDrawer(instanceId)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, instanceId]);

  if (!open) return null;

  // 祖先の transform（画面遷移のバウンスアニメーション等）があると position: fixed が
  // その祖先基準になって位置がずれるため、body 直下へポータルで描く。
  return createPortal(
    <div className={styles.root} style={{ zIndex: BASE_Z_INDEX + layer * LAYER_Z_INDEX_STEP }}>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.panel}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
      >
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
    </div>,
    document.body,
  );
};

const pushDrawer = (id: symbol) => {
  if (!drawerStack.includes(id)) drawerStack.push(id);
};

const removeDrawer = (id: symbol) => {
  const index = drawerStack.indexOf(id);
  if (index >= 0) drawerStack.splice(index, 1);
};

const isTopDrawer = (id: symbol) => drawerStack[drawerStack.length - 1] === id;
