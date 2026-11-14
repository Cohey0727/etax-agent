import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 入力欄のラベル列。幅を固定して入力欄の左端を揃える。
  fieldLabel: style({
    flex: "0 0 210px",
    display: "flex",
    alignItems: "center",
  }),
  // テキスト入力欄。
  fieldInput: style({
    flex: "1 1 auto",
  }),
  // 金額の入力欄。数字を右寄せにする。
  fieldNumber: style({
    flex: "1 1 auto",
    textAlign: "right",
  }),
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
};

export default styles;
