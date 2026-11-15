import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 年度推移の棒グラフ。売上=インディゴ、経費=赤、収支=ティール。
const REVENUE_COLOR = "#4a3aff";
const EXPENSE_COLOR = "#e5484d";
const BALANCE_COLOR = "#0d9488";

const swatchBase = {
  flex: "0 0 auto",
  width: "10px",
  height: "10px",
  borderRadius: "3px",
} as const;

const styles = {
  chartWrap: style({
    display: "flex",
    justifyContent: "center",
    padding: `${theme.space.sm} 0`,
    overflowX: "auto",
  }),
  barRevenue: style({ fill: REVENUE_COLOR }),
  barExpense: style({ fill: EXPENSE_COLOR }),
  barBalance: style({ fill: BALANCE_COLOR }),
  barBalanceNegative: style({ fill: EXPENSE_COLOR }),
  axis: style({
    stroke: theme.color.border,
    strokeWidth: 1,
  }),
  valueLabel: style({
    fill: theme.color.muted,
    fontSize: "10px",
    textAnchor: "middle",
  }),
  yearLabel: style({
    fill: theme.color.text,
    fontSize: "11px",
    fontWeight: theme.fontWeight.semibold,
    textAnchor: "middle",
  }),
  swatchRevenue: style({ ...swatchBase, backgroundColor: REVENUE_COLOR }),
  swatchExpense: style({ ...swatchBase, backgroundColor: EXPENSE_COLOR }),
  swatchBalance: style({ ...swatchBase, backgroundColor: BALANCE_COLOR }),
  // 年度ごとの正確な金額（グラフの下に罫線付きの表で出す）。行は詰める。
  table: style({
    width: "100%",
    borderCollapse: "collapse",
  }),
  headCell: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "left",
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderBottom: `1px solid ${theme.color.border}`,
  }),
  headCellRight: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "right",
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderBottom: `1px solid ${theme.color.border}`,
  }),
  cellYear: style({
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSizes.sm,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
  }),
  cellValue: style({
    textAlign: "right",
    fontSize: theme.fontSizes.sm,
    fontVariantNumeric: "tabular-nums",
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
  }),
  cellBalance: style({
    textAlign: "right",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeight.semibold,
    fontVariantNumeric: "tabular-nums",
    padding: `${theme.space.xs} ${theme.space.sm}`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
  }),
};

export default styles;
