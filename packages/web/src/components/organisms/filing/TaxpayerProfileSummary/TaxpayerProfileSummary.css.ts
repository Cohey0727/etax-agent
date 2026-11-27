import { style } from "@vanilla-extract/css";
import { mediaquery, theme } from "@configs";

const styles = {
  // ラベル列。狭い画面では値の上に積み、広い画面では幅を固定して値の左端を揃える。
  label: style({
    flex: "1 1 100%",
    "@media": {
      [mediaquery.sm]: { flex: "0 0 210px" },
    },
  }),
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
};

export default styles;
