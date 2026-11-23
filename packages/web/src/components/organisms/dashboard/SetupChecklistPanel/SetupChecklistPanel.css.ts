import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 独立した項目1件分の行。順序は表さず、状態と移動ボタンだけを示す。
  row: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.space.md,
    minHeight: "24px",
  }),
  itemLabel: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
    // ラベルとチップは行側で縮めない（詳細テキスト側が折り返して吸収する）。
    flexShrink: 0,
    whiteSpace: "nowrap",
  }),
  // 補足テキスト。残り幅を使い、ここだけが折り返す。
  detail: style({
    flex: 1,
    minWidth: 0,
  }),
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
