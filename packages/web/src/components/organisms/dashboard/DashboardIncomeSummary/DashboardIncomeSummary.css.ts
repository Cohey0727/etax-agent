import { globalStyle, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  grid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.space.md,
  }),
};

// 統計カードは左から順に少しずつ遅れて弾んで現れる（Card の登場アニメーションへの遅延）。
globalStyle(`${styles.grid} > *:nth-child(2)`, { animationDelay: "0.05s" });
globalStyle(`${styles.grid} > *:nth-child(3)`, { animationDelay: "0.1s" });
globalStyle(`${styles.grid} > *:nth-child(4)`, { animationDelay: "0.15s" });
globalStyle(`${styles.grid} > *:nth-child(5)`, { animationDelay: "0.2s" });
globalStyle(`${styles.grid} > *:nth-child(6)`, { animationDelay: "0.25s" });

export default styles;
