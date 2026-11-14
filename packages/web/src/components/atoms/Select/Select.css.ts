import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    padding: `${theme.component.controlPaddingY} ${theme.component.controlPaddingX}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.border}`,
    fontSize: theme.fontSizes.sm,
    fontFamily: "inherit",
    background: theme.color.inputBg,
    color: theme.color.text,
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    selectors: {
      "&:focus": {
        outline: "none",
        borderColor: theme.color.accent,
        boxShadow: `0 0 0 3px ${theme.color.focusRing}`,
      },
    },
  }),
};

export default styles;
