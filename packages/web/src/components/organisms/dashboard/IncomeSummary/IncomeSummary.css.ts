import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  grid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.space.md,
  }),
};

export default styles;
