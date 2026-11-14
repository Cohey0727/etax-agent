import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  cellInput: style({
    width: "100%",
    minWidth: "92px",
  }),
  descriptionInput: style({
    width: "100%",
    minWidth: "180px",
  }),
  amountInput: style({
    width: "100%",
    minWidth: "104px",
    textAlign: "right",
  }),
  addGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: theme.space.sm,
    alignItems: "end",
  }),
};

export default styles;
