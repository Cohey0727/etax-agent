import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  optionRow: style({
    display: "flex",
    flexWrap: "wrap",
    gap: theme.space.sm,
  }),
  infoRow: style({
    display: "flex",
    justifyContent: "space-between",
    gap: theme.space.md,
    padding: `${theme.space.sm} 0`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    selectors: {
      "&:last-child": { borderBottom: "none" },
    },
  }),
};

export default styles;
