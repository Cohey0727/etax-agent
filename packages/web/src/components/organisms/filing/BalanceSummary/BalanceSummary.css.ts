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
