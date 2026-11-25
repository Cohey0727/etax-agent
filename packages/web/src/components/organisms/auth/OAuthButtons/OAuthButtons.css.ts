import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  divider: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
  }),
  dividerLine: style({
    flex: 1,
    height: "1px",
    background: theme.color.border,
  }),
  dividerText: style({
    flexShrink: 0,
  }),
  button: style({
    width: "100%",
    height: "46px",
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeight.medium,
  }),
};

export default styles;
