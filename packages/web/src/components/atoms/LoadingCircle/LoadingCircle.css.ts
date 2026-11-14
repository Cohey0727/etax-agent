import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const spin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = {
  root: style({
    display: "inline-block",
    width: theme.component.spinnerSize,
    height: theme.component.spinnerSize,
    borderRadius: "50%",
    border: `2px solid ${theme.color.border}`,
    borderTopColor: theme.color.accent,
    animation: `${spin} 0.9s linear infinite`,
  }),
};

export default styles;
