import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 金額入力欄。表のセル幅いっぱいに広げ、数字を右寄せにする。
  numberInput: style({
    width: "100%",
    minWidth: "110px",
    textAlign: "right",
  }),
  // 差分がある行を淡いアクセント地で目立たせる。
  rowChanged: style({
    background: theme.color.accentSoft,
  }),
  // 項目グループの見出し行。
  sectionCell: style({
    background: theme.color.bg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
};

export default styles;
