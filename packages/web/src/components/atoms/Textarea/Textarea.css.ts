import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    padding: `${theme.component.controlPaddingY} ${theme.component.controlPaddingX}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.border}`,
    fontSize: theme.fontSizes.sm,
    fontFamily: "inherit",
    "@media": {
      // iOS Safari のフォーカス時自動ズーム防止（Input と同じ）。
      "(max-width: 640px)": { fontSize: "16px" },
    },
    lineHeight: 1.6,
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
