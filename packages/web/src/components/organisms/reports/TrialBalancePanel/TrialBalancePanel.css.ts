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
  // マイナスの金額（赤字・貸借の不一致）。
  amountNegative: style({
    color: theme.color.negative,
  }),
  tableScroll: style({
    overflowX: "auto",
  }),
  // 損益計算書の表。科目＋当年・前年・増減の3つの金額列。
  plRow: style({
    ...rowBase,
    gridTemplateColumns: "minmax(9rem, 1fr) repeat(3, minmax(6.5rem, 9rem))",
  }),
  // 月次推移の表。月＋当年4列＋前年3列。
  monthRow: style({
    ...rowBase,
    gridTemplateColumns: "2.5rem repeat(7, minmax(5.5rem, 1fr))",
  }),
  // 貸借対照表の表。科目＋期首・期末。
  bsRow: style({
    ...rowBase,
    gridTemplateColumns: "minmax(9rem, 1fr) repeat(2, minmax(7rem, 11rem))",
  }),
  headRow: style({
    color: theme.color.muted,
    fontSize: theme.fontSizes.sm,
    borderBottom: `1px solid ${theme.color.borderStrong}`,
  }),
  cell: style({
    textAlign: "right",
  }),
  subtotalRow: style({
    fontWeight: theme.fontWeight.semibold,
  }),
  totalRow: style({
    borderBottom: "none",
    borderTop: `2px solid ${theme.color.borderStrong}`,
    fontWeight: theme.fontWeight.semibold,
  }),
  // ドリルダウンできる科目名（帳簿へ遷移するボタン）。
  categoryButton: style({
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    textAlign: "left",
    color: theme.color.accent,
    cursor: "pointer",
    whiteSpace: "nowrap",
    selectors: {
      "&:hover": { textDecoration: "underline" },
    },
  }),
};

export default styles;
