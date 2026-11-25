import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 左側のテキスト列。縮められるようにして、右のボタンが落ちないようにする。
  itemMain: style({
    flex: 1,
    minWidth: 0,
  }),
  // 項目名。
  itemLabel: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 0,
    whiteSpace: "nowrap",
  }),
};

export default styles;
