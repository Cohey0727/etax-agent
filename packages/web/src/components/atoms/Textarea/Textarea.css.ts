import { style, styleVariants } from "@vanilla-extract/css";
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
  variant: styleVariants({
    default: {},
    code: {
      width: "100%",
      minHeight: "220px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: theme.fontSizes.xs,
    },
  }),
};

export default styles;
