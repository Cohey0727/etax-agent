import { globalStyle } from "@vanilla-extract/css";
import { theme } from "./theme.css";

globalStyle(":root", { colorScheme: "light" });
globalStyle(":root[data-theme=\"dark\"]", { colorScheme: "dark" });

globalStyle("body", {
  margin: 0,
  fontFamily:
    "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
  background: theme.color.bg,
  color: theme.color.text,
  fontSize: theme.fontSizes.base,
  lineHeight: theme.lineHeight.normal,
  WebkitFontSmoothing: "antialiased",
  textRendering: "optimizeLegibility",
  transition: `background-color ${theme.animation.durationBase} ease, color ${theme.animation.durationBase} ease`,
});

globalStyle("*", { boxSizing: "border-box" });

globalStyle("::selection", {
  background: theme.color.accentSoft,
});

globalStyle(":focus-visible", {
  outline: `2px solid ${theme.color.accent}`,
  outlineOffset: "2px",
});

// 動きを抑える設定の利用者にはアニメーションをほぼ無効化する。
globalStyle("*", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      animationDuration: "0.01ms",
      animationIterationCount: 1,
      transitionDuration: "0.01ms",
    },
  },
});
