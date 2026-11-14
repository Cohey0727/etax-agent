import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  row: style({
    display: "grid",
    gridTemplateColumns: "1fr 180px",
    alignItems: "center",
    gap: theme.space.sm,
    "@media": {
      "(max-width: 640px)": { gridTemplateColumns: "1fr" },
    },
  }),
  description: style({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
};

export default styles;
