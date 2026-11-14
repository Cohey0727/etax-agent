import { keyframes, style } from "@vanilla-extract/css";
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

export default styles;
