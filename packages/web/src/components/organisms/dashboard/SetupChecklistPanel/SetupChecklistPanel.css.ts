import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 独立した項目1件分の行。順序は表さず、状態と移動ボタンだけを示す。
  // ラベル＋チップ／詳細／ボタンを縦に積み、狭幅でも潰さず最初から全て見えるようにする。
  row: style({
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.space.sm,
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
  // 補足テキスト。行の中で自然に折り返す。
  detail: style({}),
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
