import { keyframes, style } from "@vanilla-extract/css";
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
    borderRadius: theme.borderRadius.pill,
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
    animation: `${popIn} 0.4s ${theme.animation.spring} both`,
  }),
};

export default styles;
