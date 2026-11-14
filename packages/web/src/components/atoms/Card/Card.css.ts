import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    background: theme.color.card,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.space.md,
  }),
};

export default styles;
