import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  recordRow: style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: theme.space.md,
    padding: `${theme.space.sm} 0`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    selectors: {
      "&:last-child": { borderBottom: "none" },
    },
  }),
  recordMain: style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  recordSide: style({
    flexShrink: 0,
  }),
  mono: style({
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: theme.fontSizes.xs,
  }),
  promptPre: style({
    margin: 0,
    background: theme.color.hover,
    borderRadius: theme.borderRadius.md,
    padding: theme.space.md,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: "260px",
    overflowY: "auto",
  }),
};

export default styles;
