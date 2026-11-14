import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 登場時にふわりと弾んで現れる。
const popIn = keyframes({
  "0%": { opacity: 0, transform: "scale(0.96) translateY(6px)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

const styles = {
  root: style({
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: theme.component.cardPadding,
    boxShadow: theme.shadow.card,
    animation: `${popIn} 0.45s ${theme.animation.springSoft} both`,
    transition: `box-shadow 0.25s ease, border-color 0.25s ease, transform 0.35s ${theme.animation.spring}`,
    selectors: {
      "&:hover": {
        boxShadow: theme.shadow.cardHover,
        borderColor: theme.color.borderStrong,
        transform: "translateY(-2px)",
      },
    },
  }),
};

export default styles;
