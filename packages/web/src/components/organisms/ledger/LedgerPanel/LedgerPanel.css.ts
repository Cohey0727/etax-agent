import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 「追加」ドロップダウンの出現アニメーション（小さく跳ねる）。
const menuPop = keyframes({
  "0%": { opacity: 0, transform: "scale(0.94) translateY(-4px)" },
  "60%": { opacity: 1, transform: "scale(1.02) translateY(0)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

const styles = {
  cellInput: style({
    width: "100%",
    minWidth: "92px",
  }),
  // 操作列は保存・削除を必ず横並びにする。表の列幅計算で潰れてボタンが
  // 縦に積まれるのを防ぐため、セルは折り返し禁止、行は内容幅に固定する。
  actionsCell: style({
    whiteSpace: "nowrap",
  }),
  actionsRow: style({
    width: "max-content",
  }),
  // 表の受け皿。背景は白（カードと同じ面の色）にし、幅が足りないときは
  // この中で横スクロールさせる。サイドバーやエージェントパネルを開いて
  // 主領域が狭くなっても、列が外へはみ出さないようにする。
  tableWrap: style({
    width: "100%",
    overflowX: "auto",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadow.card,
  }),
  // 件数・収入・支出・差引の統計カードの並び。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: theme.space.md,
  }),
  searchWrap: style({
    position: "relative",
    flex: 1,
    maxWidth: "420px",
  }),
  searchIcon: style({
    position: "absolute",
    left: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    color: theme.color.muted,
    pointerEvents: "none",
    display: "flex",
  }),
  searchInput: style({
    width: "100%",
    paddingLeft: "34px",
  }),
  descriptionInput: style({
    width: "100%",
    minWidth: "180px",
  }),
  amountInput: style({
    width: "100%",
    minWidth: "104px",
    textAlign: "right",
  }),
  addGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: theme.space.sm,
    alignItems: "end",
  }),
  // 「追加」ボタンとドロップダウンの位置基準。
  addMenuWrap: style({
    position: "relative",
  }),
  // メニュー外クリックで閉じるための全面 backdrop。
  menuBackdrop: style({
    position: "fixed",
    inset: 0,
    zIndex: 30,
  }),
  addMenu: style({
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 31,
    minWidth: "232px",
    padding: theme.space.xs,
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadow.card,
    transformOrigin: "top right",
    animation: `${menuPop} ${theme.animation.durationBase} ${theme.animation.spring}`,
  }),
  menuItem: style({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "9px 10px",
    border: "none",
    borderRadius: theme.borderRadius.sm,
    background: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "14px",
    textAlign: "left",
    cursor: "pointer",
    selectors: {
      "&:hover": { background: theme.color.hover },
    },
  }),
};

// 統計カードは左から順に少しずつ遅れて弾んで現れる（Card の登場アニメーションへの遅延）。
globalStyle(`${styles.statGrid} > *:nth-child(2)`, { animationDelay: "0.05s" });
globalStyle(`${styles.statGrid} > *:nth-child(3)`, { animationDelay: "0.1s" });
globalStyle(`${styles.statGrid} > *:nth-child(4)`, { animationDelay: "0.15s" });

export default styles;
