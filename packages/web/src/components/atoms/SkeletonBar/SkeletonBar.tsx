import { clsx } from "clsx";
import styles from "./SkeletonBar.css";

export interface SkeletonBarProps {
  /** 横幅（CSSの値のまま style に渡す） */
  width?: string;
  /** 高さ（px） */
  height?: number;
  className?: string;
}

/**
 * 読み込み中に実データの代わりへ出す灰色のバー。
 * 大きさは呼び出し側が実レイアウトに合わせて決める。
 */
export const SkeletonBar = ({ width = "100%", height = 14, className }: SkeletonBarProps) => {
  return (
    <span aria-hidden="true" className={clsx(styles.root, className)} style={{ width, height }} />
  );
};
