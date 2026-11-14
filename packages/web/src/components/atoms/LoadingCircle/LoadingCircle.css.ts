import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const spin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = {
  root: style({
    display: "inline-block",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    border: `2px solid ${theme.color.accentSoft}`,
    borderTopColor: theme.color.accent,
    animation: `${spin} 0.8s linear infinite`,
  }),
};

export default styles;
