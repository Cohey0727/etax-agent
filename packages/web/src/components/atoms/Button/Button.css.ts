import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  base: style({
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.accent}`,
    cursor: "pointer",
    selectors: {
      "&:disabled": { opacity: 0.5, cursor: "default" },
    },
  }),
  variant: styleVariants({
    primary: {
      background: theme.color.accent,
      color: "#fff",
    },
    ghost: {
      background: theme.color.card,
      color: theme.color.accent,
    },
    tab: {
      background: theme.color.card,
      borderColor: theme.color.border,
      color: theme.color.text,
    },
    tabActive: {
      background: theme.color.accent,
      borderColor: theme.color.accent,
      color: "#fff",
      fontWeight: 600,
    },
  }),
  size: styleVariants({
    sm: { padding: "8px 14px", fontSize: theme.fontSizes.sm },
    md: { padding: "8px 16px", fontSize: theme.fontSizes.base },
  }),
};

export default styles;
