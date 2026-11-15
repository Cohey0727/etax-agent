import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 円グラフ（ドーナツ）のスライス色。収入はアクセント（インディゴ）の濃淡、
// 支出は支出色（赤）の濃淡で並べ、凡例の順とスライスの順を一致させる。
const SLICE_OPACITIES: readonly number[] = [1, 0.78, 0.6, 0.45, 0.33, 0.24];

const sliceBase = {
  fill: "none",
  strokeWidth: 20,
} as const;

const styles = {
  // 収入と支出を横並びにする（狭い画面では縦積み）。
  grid: style({
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.space.lg,
    "@media": {
      "(max-width: 900px)": {
        gridTemplateColumns: "1fr",
      },
    },
  }),
  chartWrap: style({
    display: "flex",
    justifyContent: "center",
    padding: `${theme.space.sm} 0`,
  }),
  donut: style({
    width: "176px",
    height: "176px",
  }),
  sliceIncome: SLICE_OPACITIES.map((opacity) =>
    style({ ...sliceBase, stroke: theme.color.accent, strokeOpacity: opacity }),
  ),
  sliceExpense: SLICE_OPACITIES.map((opacity) =>
    style({ ...sliceBase, stroke: theme.color.negative, strokeOpacity: opacity }),
  ),
  centerLabel: style({
    fill: theme.color.muted,
    fontSize: "10px",
    textAnchor: "middle",
  }),
  centerValue: style({
    fill: theme.color.text,
    fontSize: "13px",
    fontWeight: theme.fontWeight.semibold,
    textAnchor: "middle",
  }),
  // 凡例の色見本。スライスと同じ色・濃さにする。
  swatchIncome: SLICE_OPACITIES.map((opacity) =>
    style({
      flex: "0 0 auto",
      width: "10px",
      height: "10px",
      borderRadius: "3px",
      backgroundColor: theme.color.accent,
      opacity,
    }),
  ),
  swatchExpense: SLICE_OPACITIES.map((opacity) =>
    style({
      flex: "0 0 auto",
      width: "10px",
      height: "10px",
      borderRadius: "3px",
      backgroundColor: theme.color.negative,
      opacity,
    }),
  ),
  rowName: style({
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  rowAmount: style({
    flex: "0 0 auto",
    textAlign: "right",
    fontWeight: theme.fontWeight.semibold,
  }),
  rowShare: style({
    flex: "0 0 42px",
    textAlign: "right",
  }),
};

export default styles;
