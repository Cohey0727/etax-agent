import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// 出現時の小さなポップ。選択中ナビなど、状態が切り替わった要素に使う。
const popIn = keyframes({
  "0%": { transform: "scale(0.92)" },
  "60%": { transform: "scale(1.04)" },
  "100%": { transform: "scale(1)" },
});

const styles = {
  base: style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: theme.borderRadius.sm,
    border: "1px solid transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: `background-color ${theme.animation.durationFast} ease, color ${theme.animation.durationFast} ease, border-color ${theme.animation.durationFast} ease, box-shadow 0.25s ${theme.animation.springSoft}, transform ${theme.animation.durationBase} ${theme.animation.spring}`,
    selectors: {
      "&:active": { transform: "scale(0.93)" },
      "&:disabled": { opacity: 0.5, cursor: "default", transform: "none" },
    },
  }),
  variant: styleVariants({
    danger: {
      background: theme.color.negative,
      borderColor: theme.color.negative,
      color: theme.color.onAccent,
      fontWeight: theme.fontWeight.semibold,
      selectors: {
        "&:hover": { opacity: 0.88 },
      },
    },
    primary: {
      background: theme.color.accent,
      borderColor: theme.color.accent,
      color: theme.color.onAccent,
      fontWeight: theme.fontWeight.semibold,
      selectors: {
        "&:hover": {
          background: theme.color.accentHover,
          borderColor: theme.color.accentHover,
          boxShadow: theme.shadow.button,
          transform: "translateY(-1px) scale(1.03)",
        },
      },
    },
    ghost: {
      background: "transparent",
      borderColor: theme.color.border,
      color: theme.color.text,
      selectors: {
        "&:hover": {
          borderColor: theme.color.borderStrong,
          background: theme.color.hover,
          transform: "scale(1.03)",
        },
      },
    },
    // タブはピル型。選択中はアクセント色で満たす。
    tab: {
      background: "transparent",
      borderColor: "transparent",
      borderRadius: theme.borderRadius.pill,
      color: theme.color.muted,
      selectors: {
        "&:hover": {
          background: theme.color.hover,
          color: theme.color.text,
          transform: "scale(1.05)",
        },
      },
    },
    tabActive: {
      background: theme.color.accent,
      borderColor: theme.color.accent,
      borderRadius: theme.borderRadius.pill,
      color: theme.color.onAccent,
      fontWeight: theme.fontWeight.semibold,
      boxShadow: theme.shadow.button,
      animation: `${popIn} 0.35s ${theme.animation.spring} both`,
      selectors: {
        "&:hover": { background: theme.color.accentHover },
      },
    },
    // サイドバーのナビ。アイコン+ラベルを左寄せで並べ、選択中は淡いアクセント地に色字。
    // base の justifyContent: center が残ると中央寄せになるため、明示的に上書きする。
    nav: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "10px",
      width: "100%",
      background: "transparent",
      borderColor: "transparent",
      borderRadius: theme.borderRadius.sm,
      color: theme.color.textSubtle,
      fontWeight: theme.fontWeight.medium,
      textAlign: "left",
      selectors: {
        "&:hover": {
          background: theme.color.hover,
          color: theme.color.text,
          transform: "translateX(3px)",
        },
        "&:active": { transform: "translateX(3px) scale(0.97)" },
      },
    },
    navActive: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "10px",
      width: "100%",
      background: theme.color.accentSoft,
      borderColor: "transparent",
      borderRadius: theme.borderRadius.sm,
      color: theme.color.accent,
      fontWeight: theme.fontWeight.semibold,
      textAlign: "left",
      animation: `${popIn} 0.35s ${theme.animation.spring} both`,
      selectors: {
        "&:active": { transform: "scale(0.97)" },
      },
    },
  }),
  size: styleVariants({
    sm: { padding: "7px 14px", fontSize: theme.fontSizes.sm },
    md: {
      padding: `${theme.component.controlPaddingY} ${theme.component.controlPaddingX}`,
      fontSize: theme.fontSizes.base,
    },
  }),
};

export default styles;
