import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.lg,
    background: theme.color.bg,
  }),
  error: style({
    color: theme.color.negative,
  }),
};

export default styles;
