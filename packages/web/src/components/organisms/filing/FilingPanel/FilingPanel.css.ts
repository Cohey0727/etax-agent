import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 独立した項目1件分の行。区切り線で並べるだけで、順序は表さない。
  statusRow: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.md,
    paddingTop: theme.space.md,
    borderTop: `1px solid ${theme.color.border}`,
    flexWrap: "wrap",
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
  }),
  // 状態（済み）。アクセント色の小さな文字で示す。
  stateDone: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.accentText,
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
  }),
  // 状態（未）。
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
