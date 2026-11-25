import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const rowBase = {
  display: "grid",
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
} as const;

const styles = {
  // マイナスの金額（残高不足など）。
  amountNegative: style({
    color: theme.color.negative,
  }),
  tableScroll: style({
    overflowX: "auto",
  }),
  // 月次表。月＋実績2列＋予定・増減・月末残高。
  monthRow: style({
    ...rowBase,
    gridTemplateColumns: "minmax(7rem, 1fr) repeat(5, minmax(6rem, 1fr))",
  }),
  // 入金予定の表。予定月・取引先・番号・期日・状態・残額。
  receiptRow: style({
    ...rowBase,
    gridTemplateColumns:
      "minmax(5.5rem, 0.7fr) minmax(9rem, 1.4fr) minmax(6rem, 0.8fr) minmax(6.5rem, 0.8fr) minmax(5.5rem, 0.7fr) minmax(6.5rem, 0.9fr)",
  }),
  headRow: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    borderBottom: `1px solid ${theme.color.borderStrong}`,
  }),
  cell: style({
    textAlign: "right",
  }),
  totalRow: style({
    borderBottom: "none",
    borderTop: `2px solid ${theme.color.borderStrong}`,
    fontWeight: theme.fontWeight.semibold,
  }),
  phaseLabel: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.xs,
    marginLeft: theme.space.xs,
  }),
  overdueLabel: style({
    color: theme.color.negative,
    fontWeight: theme.fontWeight.semibold,
  }),
  // 残高推移のバーチャート。
  chart: style({
    display: "flex",
    alignItems: "flex-end",
    gap: theme.space.xs,
    height: "9rem",
    paddingTop: theme.space.sm,
  }),
  chartColumn: style({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    height: "100%",
    minWidth: 0,
  }),
  chartSpacer: style({}),
  chartBar: style({
    background: theme.color.accent,
    borderRadius: "4px 4px 0 0",
    minHeight: "2px",
  }),
  chartBarNegative: style({
    background: theme.color.negative,
    borderRadius: "0 0 4px 4px",
    minHeight: "2px",
  }),
  chartLabel: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.xs,
    textAlign: "center",
    paddingTop: theme.space.xs,
    whiteSpace: "nowrap",
  }),
  openingBalanceInput: style({
    width: "10rem",
  }),
};

export default styles;
