import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// スケルトンの明滅（読み込み中であることを静かに示す）。
const pulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.45 },
});

const styles = {
  // 推移グラフの描画域。ベースライン（下辺の罫）に棒を立てる。
  chart: style({
    display: "flex",
    alignItems: "flex-end",
    gap: "44px",
    height: "158px",
    padding: "0 8px",
    borderBottom: `2px solid ${theme.color.lineSoft}`,
  }),
  // 年度1グループ分（3本の棒）。
  chartGroup: style({
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  }),
  // 棒1本分（値ラベル＋棒）。
  barCol: style({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  }),
  // 年度ラベルの並び（棒グループと同じ幅・間隔で揃える）。
  yearRow: style({
    display: "flex",
    gap: "44px",
    padding: "8px 8px 0",
  }),
  yearCell: style({
    width: "106px",
    display: "flex",
    justifyContent: "center",
  }),
  // 推移表の行（罫線つき、金額列は右寄せ）。
  tableRow: style({
    display: "grid",
    gridTemplateColumns: "64px 1fr 1fr 1fr",
    alignItems: "center",
    padding: "8px 0",
    borderTop: `1px solid ${theme.color.lineSoft}`,
  }),
  tableCellRight: style({
    display: "flex",
    justifyContent: "flex-end",
  }),
  // 所得サマリーのカードグリッド（IncomeSummary と同じ）。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.space.md,
  }),
  // 内訳の2列グリッド（BreakdownPanel と同じ）。
  breakdownGrid: style({
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.space.md,
    "@media": {
      "(max-width: 900px)": {
        gridTemplateColumns: "1fr",
      },
    },
  }),
  // ドーナツグラフの輪。
  donut: style({
    width: "120px",
    height: "120px",
    margin: "0 auto",
    borderRadius: "50%",
    border: `16px solid ${theme.color.lineSoft}`,
    boxSizing: "border-box",
    animation: `${pulse} 1.4s ease-in-out infinite`,
  }),
};

export default styles;
