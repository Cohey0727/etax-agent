import { globalStyle, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 所得の統計カードの並び。
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
  // 月別グラフ。12か月を横に並べ、各月に収入・支出の2本のバーを立てる。
  // バーは各月の幅いっぱいに広げ、月同士の間隔を詰めて密度を出す。
  chart: style({
    display: "flex",
    gap: theme.space.xs,
  }),
  chartCol: style({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: theme.space.xs,
    minWidth: 0,
  }),
  chartBars: style({
    height: "96px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: "2px",
    borderBottom: `1px solid ${theme.color.lineSoft}`,
  }),
  chartBarIncome: style({
    flex: "1 1 0",
    minHeight: "2px",
    borderRadius: "3px 3px 0 0",
    background: theme.color.accent,
  }),
  chartBarExpense: style({
    flex: "1 1 0",
    minHeight: "2px",
    borderRadius: "3px 3px 0 0",
    background: theme.color.negative,
  }),
  chartLabel: style({
    textAlign: "center",
    fontSize: theme.fontSizes.xs,
  }),
  // グラフの凡例の色見本。
  legendSwatchIncome: style({
    width: "10px",
    height: "10px",
    borderRadius: "3px",
    background: theme.color.accent,
  }),
  legendSwatchExpense: style({
    width: "10px",
    height: "10px",
    borderRadius: "3px",
    background: theme.color.negative,
  }),
};

// 統計カードは左から順に少しずつ遅れて弾んで現れる（Card の登場アニメーションへの遅延）。
globalStyle(`${styles.statGrid} > *:nth-child(2)`, { animationDelay: "0.05s" });
globalStyle(`${styles.statGrid} > *:nth-child(3)`, { animationDelay: "0.1s" });

export default styles;
