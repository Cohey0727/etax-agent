import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  row: style({
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
    borderTop: `1px solid ${theme.color.border}`,
  }),
  thumb: style({
    width: "96px",
    height: "96px",
    objectFit: "cover",
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.color.border}`,
    flexShrink: 0,
    "@media": {
      // 狭い画面ではサムネイルを小さくし、本文の幅を確保する。
      "(max-width: 640px)": { width: "72px", height: "72px" },
    },
  }),
  body: style({
    flex: 1,
    minWidth: "240px",
    "@media": {
      "(max-width: 640px)": { minWidth: "0" },
    },
  }),
};

export default styles;
