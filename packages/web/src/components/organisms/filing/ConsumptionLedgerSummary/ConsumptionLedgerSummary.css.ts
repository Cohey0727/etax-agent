import { style } from "@vanilla-extract/css";
import { mediaquery, theme } from "@configs";

const styles = {
  // ラベル列。狭い画面では金額の上に積み、広い画面では幅を固定して金額の左端を揃える。
  label: style({
    flex: "1 1 100%",
    "@media": {
      [mediaquery.sm]: { flex: "0 0 210px" },
    },
  }),
  // 帳簿集計の読み取り専用の金額。右寄せ＋等幅数字。
  amount: style({
    flex: "1 1 100%",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    "@media": {
      [mediaquery.sm]: { flex: "1 1 auto" },
    },
  }),
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
};

export default styles;
