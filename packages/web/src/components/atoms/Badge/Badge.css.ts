import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    display: "inline-block",
    padding: "1px 8px",
    borderRadius: "999px",
    background: theme.color.accentSoft,
    color: theme.color.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: 600,
  }),
};

export default styles;
