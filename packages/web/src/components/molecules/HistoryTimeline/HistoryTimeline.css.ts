import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 履歴1件のまとまり。下の区切り線で次の履歴と分ける。
  entry: style({
    paddingBottom: theme.space.lg,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    selectors: {
      "&:last-child": {
        paddingBottom: 0,
        borderBottom: "none",
      },
    },
  }),
  // 差分行の並び。項目名・変更前・矢印・変更後を列でそろえる。
  changes: style({
    display: "grid",
    gridTemplateColumns: "6.5rem minmax(0, 1fr) auto minmax(0, 1fr)",
    columnGap: theme.space.sm,
    rowGap: theme.space.sm,
    alignItems: "baseline",
  }),
  beforeValue: style({
    color: theme.color.muted,
    textDecoration: "line-through",
  }),
};

export default styles;
