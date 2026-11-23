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
  // 状態（済み）。アクセント色の小さな文字で示す。
  stateDone: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.accentText,
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),
  // 状態（未）。
  stateTodo: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.color.muted,
    backgroundColor: theme.color.lineSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),
};

export default styles;
