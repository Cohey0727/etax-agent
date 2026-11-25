import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const popIn = keyframes({
  "0%": { transform: "scale(0.7)" },
  "60%": { transform: "scale(1.1)" },
  "100%": { transform: "scale(1)" },
});

const styles = {
  root: style({
    display: "inline-block",
    padding: "2px 10px",
    // チップのテキストは絶対に折り返さない（共通ルール。利用側で上書きしない）。
    whiteSpace: "nowrap",
    flexShrink: 0,
    borderRadius: theme.borderRadius.pill,
    fontSize: theme.fontSizes.xs,
    animation: `${popIn} 0.4s ${theme.animation.spring} both`,
  }),
  // 色調。状態表示は accent=済み・muted=未 のように意味で使い分ける。
  tone: styleVariants({
    accent: {
      background: theme.color.accentSoft,
      color: theme.color.accentText,
      fontWeight: theme.fontWeight.semibold,
    },
    muted: {
      background: theme.color.lineSoft,
      color: theme.color.muted,
      fontWeight: theme.fontWeight.medium,
    },
  }),
};

export default styles;
