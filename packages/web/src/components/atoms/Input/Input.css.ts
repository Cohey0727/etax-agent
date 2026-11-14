import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    padding: "8px 10px",
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.border}`,
    fontSize: theme.fontSizes.sm,
    background: theme.color.card,
    color: theme.color.text,
  }),
};

export default styles;
