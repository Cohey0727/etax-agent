import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 入力欄の右端に重ねる表示切替ボタン。
  toggle: style({
    position: "absolute",
    right: "6px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    border: "none",
    borderRadius: theme.borderRadius.sm,
    background: "transparent",
    color: theme.color.muted,
    cursor: "pointer",
    transition: `color ${theme.animation.durationFast} ease, background-color ${theme.animation.durationFast} ease, transform ${theme.animation.durationBase} ${theme.animation.spring}`,
    selectors: {
      "&:hover": {
        color: theme.color.text,
        background: theme.color.hover,
        transform: "translateY(-50%) scale(1.08)",
      },
      "&:active": { transform: "translateY(-50%) scale(0.92)" },
    },
  }),
};

export default styles;
