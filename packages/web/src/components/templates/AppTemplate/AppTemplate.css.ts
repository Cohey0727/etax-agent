import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  shell: style({
    maxWidth: "1080px",
    margin: "0 auto",
    padding: "20px 16px 48px",
  }),
  footer: style({
    borderTop: `1px solid ${theme.color.border}`,
    paddingTop: "12px",
    marginTop: theme.space.lg,
  }),
};

export default styles;
