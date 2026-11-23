import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  align: styleVariants({
    left: {},
    right: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  }),
  tone: styleVariants({
    default: {},
    positive: { color: theme.color.positive },
    negative: { color: theme.color.negative },
    muted: { color: theme.color.muted },
  }),
};

export default styles;
