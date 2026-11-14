import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  scroll: style({
    overflowX: "auto",
  }),
  numeric: style({
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  }),
};

export default styles;
