import { globalStyle, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 収支の統計カードの並び。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: theme.space.md,
  }),
  // 合計の最終行（所得合計）。区切り線と太字で締める。
  totalRow: style({
    borderTop: `2px solid ${theme.color.borderStrong}`,
    paddingTop: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
  }),
  // 区分ごとの差引の小計行。
  subtotalRow: style({
    borderTop: `1px solid ${theme.color.borderStrong}`,
    paddingTop: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
  }),
  // 2カラムの並び（事業／不動産、収入／支出の内訳）。狭い画面では縦に積む。
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
  // 科目内訳の割合バー。土台の線の上に金額比で色を伸ばす。
  barTrack: style({
    height: "6px",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.lineSoft,
    overflow: "hidden",
  }),
  barFillIncome: style({
    height: "100%",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.accent,
  }),
  barFillExpense: style({
    height: "100%",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.negative,
  }),
};

// 統計カードは左から順に少しずつ遅れて弾んで現れる（Card の登場アニメーションへの遅延）。
globalStyle(`${styles.statGrid} > *:nth-child(2)`, { animationDelay: "0.05s" });
globalStyle(`${styles.statGrid} > *:nth-child(3)`, { animationDelay: "0.1s" });

export default styles;
