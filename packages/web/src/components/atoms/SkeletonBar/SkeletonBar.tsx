import { clsx } from "clsx";
import styles from "./SkeletonBar.css";

export interface SkeletonBarProps {
  /** 横幅（CSSの値のまま style に渡す） */
  width?: string;
  /** 高さ（px） */
  height?: number;
  /** 角丸（px）。棒グラフの棒など四角い要素では小さい値を渡す */
  radius?: number;
  className?: string;
}

/**
 * 読み込み中に実データの代わりへ出す灰色のバー。
 * 大きさは呼び出し側が実レイアウトに合わせて決める。
 */
export const SkeletonBar = ({ width = "100%", height = 14, radius, className }: SkeletonBarProps) => {
  return (
    <span
      aria-hidden="true"
      className={clsx(styles.root, className)}
      style={{ width, height, borderRadius: radius }}
    />
  );
};
