import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 円グラフ（ドーナツ）のスライス色。科目ごとに別の色を割り当てて
// 見分けられるようにする（濃淡グラデーションは隣同士が判別しにくい）。
// 「その他」は残余の受け皿なので常にグレー。
const SLICE_COLORS: readonly string[] = [
  "#4a3aff", // インディゴ（アクセント）
  "#0d9488", // ティール
  "#d97706", // アンバー
  "#0284c7", // スカイ
  "#9333ea", // パープル
  "#db2777", // ピンク
  "#16a34a", // グリーン
  "#ea580c", // オレンジ
];

const OTHER_COLOR = "#9ca3af";

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
  slicePalette: SLICE_COLORS.map((color) => style({ ...sliceBase, stroke: color })),
  sliceOther: style({ ...sliceBase, stroke: OTHER_COLOR }),
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
  // 凡例の色見本。スライスと同じ色にする。
  swatchPalette: SLICE_COLORS.map((color) =>
    style({
      flex: "0 0 auto",
      width: "10px",
      height: "10px",
      borderRadius: "3px",
      backgroundColor: color,
    }),
  ),
  swatchOther: style({
    flex: "0 0 auto",
    width: "10px",
    height: "10px",
    borderRadius: "3px",
    backgroundColor: OTHER_COLOR,
  }),
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
