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
  }),
  stateDone: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.accentText,
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
  }),
  stateTodo: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.color.muted,
    backgroundColor: theme.color.lineSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
  }),
};

export default styles;
