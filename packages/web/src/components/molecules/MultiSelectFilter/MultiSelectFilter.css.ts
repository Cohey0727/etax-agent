import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  wrap: style({
    position: "relative",
    display: "inline-flex",
  }),
  selectedRow: style({
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.space.xs,
  }),
  valueChip: style({
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 4px 2px 10px",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 1.6,
  }),
  valueRemove: style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    padding: 0,
    border: "none",
    borderRadius: theme.borderRadius.pill,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    selectors: {
      "&:hover": { background: theme.color.hover },
    },
  }),
  toggle: style({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    // フィルターチップ内で Select と高さを揃える（チップ同士の高さズレ防止）。
    height: theme.component.controlHeight,
    background: "transparent",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.pill,
    color: theme.color.textSubtle,
    padding: "2px 10px",
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.6,
    cursor: "pointer",
    selectors: {
      "&:hover": { borderColor: theme.color.borderStrong, background: theme.color.hover },
    },
  }),
  overlay: style({
    position: "fixed",
    inset: 0,
    background: "transparent",
    border: "none",
    padding: 0,
    zIndex: 60,
    cursor: "default",
  }),
  panel: style({
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 70,
    minWidth: "210px",
    maxHeight: "264px",
    overflowY: "auto",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadow.cardHover,
    padding: theme.space.xs,
  }),
  optionRow: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.fontSizes.sm,
    cursor: "pointer",
    selectors: {
      "&:hover": { background: theme.color.hover },
    },
  }),
};

export default styles;
