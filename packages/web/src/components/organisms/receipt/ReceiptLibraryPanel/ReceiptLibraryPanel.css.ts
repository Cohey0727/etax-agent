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
  }),
  body: style({
    flex: 1,
    minWidth: "240px",
  }),
};

export default styles;
