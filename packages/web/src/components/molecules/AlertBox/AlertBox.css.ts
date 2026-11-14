import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    border: "1px solid",
    borderRadius: theme.borderRadius.sm,
    padding: "10px 12px",
    fontSize: theme.fontSizes.sm,
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
