import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 税額の統計カードの並び。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: theme.space.md,
  }),
  // 金額は右寄せ＋等幅数字で桁を揃える。
  amount: style({
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  }),
  // 確定税額の行。区切り線と太字で締める。
  totalRow: style({
    borderTop: `2px solid ${theme.color.borderStrong}`,
    paddingTop: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
