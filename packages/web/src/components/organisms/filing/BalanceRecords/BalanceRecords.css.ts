import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 対象レコードの表。日付・摘要・科目・区分・税区分・金額を等幅数字で揃える。
  recordRow: style({
    display: "grid",
    gridTemplateColumns: "5.4rem minmax(0, 1fr) 6rem 3rem 5.4rem 6.5rem",
    gap: theme.space.sm,
    paddingTop: theme.space.xs,
    paddingBottom: theme.space.xs,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    fontVariantNumeric: "tabular-nums",
    alignItems: "baseline",
    "@media": {
      "(max-width: 640px)": {
        gridTemplateColumns: "4.6rem minmax(0, 1fr) 4.6rem 2.6rem 5.6rem",
        fontSize: theme.fontSizes.xs,
        gap: theme.space.xs,
      },
    },
  }),
  recordHead: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    borderBottom: `1px solid ${theme.color.borderStrong}`,
  }),
  // 摘要は長いものが多いので1行に切り取る。
  recordDesc: style({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  recordCellRight: style({
    textAlign: "right",
    whiteSpace: "nowrap",
  }),
  // 税区分は狭い画面では落とす（帳簿側で確認できる）。
  recordTaxCell: style({
    whiteSpace: "nowrap",
    "@media": {
      "(max-width: 640px)": {
        display: "none",
      },
    },
  }),
  amountNegative: style({
    color: theme.color.negative,
  }),
};

export default styles;
