import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// 通知はぽよんと弾んで現れる。
const popIn = keyframes({
  "0%": { opacity: 0, transform: "scale(0.94) translateY(4px)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

const styles = {
  root: style({
    border: "1px solid",
    borderRadius: theme.borderRadius.md,
    padding: `${theme.space.sm} ${theme.space.md}`,
    fontSize: theme.fontSizes.sm,
    animation: `${popIn} 0.4s ${theme.animation.spring} both`,
  }),
  variant: styleVariants({
    notice: {
      background: theme.color.warnBg,
      borderColor: theme.color.warnBorder,
    },
    error: {
      background: theme.color.errorBg,
      borderColor: theme.color.errorBorder,
      whiteSpace: "pre-wrap",
    },
  }),
};

export default styles;
