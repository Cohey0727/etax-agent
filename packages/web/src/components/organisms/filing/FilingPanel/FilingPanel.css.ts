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
  statusRow: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.md,
    paddingTop: theme.space.md,
    borderTop: `1px solid ${theme.color.border}`,
    flexWrap: "wrap",
    "@media": {
      // 狭い画面ではテキスト列とボタン列を縦に積む。横並びのままだと
      // ボタン列（縮まない）に押されてテキスト列が潰れ、本文が
      // 1文字ずつ折り返す崩れになるため。
      "(max-width: 640px)": { flexDirection: "column", alignItems: "stretch" },
    },
  }),
  // 左側のテキスト列。縮められるようにして、右のボタンが改行しないようにする。
  itemMain: style({
    flex: 1,
    minWidth: 0,
  }),
  // 右側のボタン列。縮ませない。
  itemActions: style({
    flexShrink: 0,
  }),
  // 項目名。
  itemLabel: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
    flexWrap: "wrap",
  }),
};

export default styles;
