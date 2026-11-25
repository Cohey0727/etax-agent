import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  submit: style({
    width: "100%",
    height: "46px",
    fontSize: theme.fontSizes.base,
  }),
};

export default styles;
