import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const rowBase = {
  display: "grid",
  gridTemplateColumns: "minmax(8rem, 1fr) repeat(2, minmax(7rem, 11rem))",
  gap: theme.space.sm,
  alignItems: "center",
  paddingTop: theme.space.xs,
  paddingBottom: theme.space.xs,
  borderBottom: `1px solid ${theme.color.lineSoft}`,
  fontVariantNumeric: "tabular-nums",
  "@media": {
    "(max-width: 640px)": {
      fontSize: theme.fontSizes.xs,
      gap: theme.space.xs,
    },
  },
} as const;

const styles = {
  row: style(rowBase),
  headRow: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    borderBottom: `1px solid ${theme.color.borderStrong}`,
  }),
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.space.sm,
  }),
  cell: style({
    textAlign: "right",
  }),
  amountInput: style({
    textAlign: "right",
    width: "100%",
  }),
  totalRow: style({
    borderBottom: "none",
    borderTop: `2px solid ${theme.color.borderStrong}`,
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
