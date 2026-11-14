import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 入力欄のラベル列。幅を固定して入力欄の左端を揃える。
  fieldLabel: style({
    flex: "0 0 210px",
    display: "flex",
    alignItems: "center",
  }),
  // 金額・人数の入力欄。数字を右寄せにする。
  fieldInput: style({
    flex: "1 1 auto",
    textAlign: "right",
  }),
  // 区分セレクト。入力欄と左端を揃えるため残りの幅を使う。
  fieldSelect: style({
    flex: "1 1 auto",
  }),
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
};

export default styles;
