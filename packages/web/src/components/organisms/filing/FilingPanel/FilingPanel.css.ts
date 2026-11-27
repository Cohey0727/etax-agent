import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 各項目の結果の数字を、その行の直下にぶら下げるブロック。
  // 左に線とインデントを付け、上の行に属することが見て分かるようにする。
  figuresBlock: style({
    marginLeft: theme.space.md,
    paddingLeft: theme.space.md,
    borderLeft: `2px solid ${theme.color.lineSoft}`,
  }),
  // 独立した項目1件分の行。区切り線で並べるだけで、順序は表さない。
  itemRow: style({
    paddingTop: theme.space.md,
    borderTop: `1px solid ${theme.color.border}`,
  }),
  // 左側のテキスト列。縮められるようにして、右のボタンが改行しないようにする。
  itemMain: style({
    flex: 1,
    minWidth: 0,
  }),
  // 項目名。
  itemLabel: style({
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
