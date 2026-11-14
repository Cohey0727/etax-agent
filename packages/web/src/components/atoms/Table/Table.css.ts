import { globalStyle, style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    width: "100%",
    borderCollapse: "collapse",
    fontSize: theme.fontSizes.sm,
    "@media": {
      // 狭い画面では表を横スクロール可能にして、ページ全体の崩れを防ぐ。
      "(max-width: 900px)": {
        display: "block",
        overflowX: "auto",
        whiteSpace: "nowrap",
      },
    },
  }),
};

globalStyle(`${styles.root} th, ${styles.root} td`, {
  borderBottom: `1px solid ${theme.color.lineSoft}`,
  padding: `${theme.component.tableCellPaddingY} ${theme.component.tableCellPaddingX}`,
  textAlign: "left",
  verticalAlign: "top",
});

globalStyle(`${styles.root} th`, {
  color: theme.color.muted,
  fontWeight: theme.fontWeight.semibold,
  fontSize: theme.fontSizes.xs,
  letterSpacing: theme.letterSpacing.wide,
  whiteSpace: "nowrap",
});

globalStyle(`${styles.root} tbody tr`, {
  transition: `background-color ${theme.animation.durationFast} ease`,
});

globalStyle(`${styles.root} tbody tr:hover`, {
  background: theme.color.hover,
});

export default styles;
