import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 合計の最終行（所得合計）。区切り線と太字で締める。
  totalRow: style({
    borderTop: `2px solid ${theme.color.borderStrong}`,
    paddingTop: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
  }),
  // 内訳の2カラム（収入／支出）。狭い画面では縦に積む。
  breakdownGrid: style({
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.space.lg,
    "@media": {
      "(max-width: 640px)": {
        gridTemplateColumns: "1fr",
      },
    },
  }),
  // 金額は右寄せ＋等幅数字で桁を揃える。
  amount: style({
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  }),
};

export default styles;
