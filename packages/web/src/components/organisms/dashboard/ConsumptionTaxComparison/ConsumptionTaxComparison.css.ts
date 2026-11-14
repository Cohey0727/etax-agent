import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  barRow: style({
    display: "grid",
    gridTemplateColumns: "150px 1fr 110px",
    alignItems: "center",
    gap: "10px",
  }),
  barTrack: style({
    background: theme.color.accentSoft,
    borderRadius: "4px",
    height: "20px",
    overflow: "hidden",
  }),
  barFill: style({
    display: "block",
    height: "100%",
    borderRadius: "4px",
    transition: "width .3s ease",
  }),
  barFillColor: styleVariants({
    standard: { background: theme.color.barStandard },
    simplified: { background: theme.color.barSimplified },
    special20: { background: theme.color.barSpecial },
  }),
  barAmount: style({
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  }),
};

export default styles;
