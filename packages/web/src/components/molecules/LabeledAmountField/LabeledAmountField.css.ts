import { style } from "@vanilla-extract/css";
import { mediaquery } from "@configs";

const styles = {
  // ラベル列。狭い画面では入力欄の上に積み、広い画面では幅を固定して入力欄の左端を揃える。
  label: style({
    flex: "1 1 100%",
    "@media": {
      [mediaquery.sm]: { flex: "0 0 210px" },
    },
  }),
  // 入力欄。数字を右寄せにする。
  input: style({
    flex: "1 1 100%",
    textAlign: "right",
    "@media": {
      [mediaquery.sm]: { flex: "1 1 auto" },
    },
  }),
};

export default styles;
