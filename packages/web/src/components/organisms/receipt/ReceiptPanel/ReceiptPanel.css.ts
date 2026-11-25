import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  hiddenInput: style({
    display: "none",
  }),
  preview: style({
    maxWidth: "320px",
    width: "100%",
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.color.border}`,
  }),
  fieldRow: style({
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    alignItems: "center",
    gap: theme.space.sm,
    "@media": {
      "(max-width: 640px)": { gridTemplateColumns: "1fr" },
    },
  }),
  // 狭い画面では登録ボタンを横幅いっぱいにして押しやすくする。
  addButton: style({
    "@media": {
      "(max-width: 640px)": { flex: 1 },
    },
  }),
};

export default styles;
