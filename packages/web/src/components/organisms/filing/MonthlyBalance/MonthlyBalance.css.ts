import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // マイナスの金額（差引・累計が赤字の月）。
  amountNegative: style({
    color: theme.color.negative,
  }),
  // 表の受け皿。列の最小幅が画面に収まらないときは、この中で横スクロール
  // させる（カードごと画面をはみ出さないようにする）。
  tableScroll: style({
    overflowX: "auto",
  }),
  // 月別収支の表。月＋4つの金額列を等幅数字で揃える。金額列は潰れて
  // 数字が欠けないよう最小幅を持たせる。
  monthRow: style({
    display: "grid",
    gridTemplateColumns: "2.5rem repeat(4, minmax(5.5rem, 1fr))",
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
