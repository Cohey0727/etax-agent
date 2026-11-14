import { globalStyle, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    width: "100%",
    borderCollapse: "collapse",
    fontSize: theme.fontSizes.sm,
  }),
};

globalStyle(`${styles.root} th, ${styles.root} td`, {
  borderBottom: `1px solid ${theme.color.border}`,
  padding: "6px 8px",
  textAlign: "left",
  verticalAlign: "top",
});

globalStyle(`${styles.root} th`, {
  color: theme.color.muted,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

export default styles;
