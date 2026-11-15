import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // マイナスの金額（差引・累計が赤字の月）。
  amountNegative: style({
    color: theme.color.negative,
  }),
  // 月別収支の表。月＋4つの金額列を等幅数字で揃える。
  monthRow: style({
    display: "grid",
    gridTemplateColumns: "2.5rem repeat(4, 1fr)",
    gap: theme.space.sm,
    paddingTop: theme.space.xs,
    paddingBottom: theme.space.xs,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    "@media": {
      "(max-width: 640px)": {
        fontSize: theme.fontSizes.xs,
        gap: theme.space.xs,
      },
    },
  }),
  monthHead: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    borderBottom: `1px solid ${theme.color.borderStrong}`,
  }),
  monthCell: style({
    textAlign: "right",
  }),
  monthTotal: style({
    borderBottom: "none",
    borderTop: `2px solid ${theme.color.borderStrong}`,
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
