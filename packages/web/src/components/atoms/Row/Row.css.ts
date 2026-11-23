import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    display: "flex",
    flexDirection: "row",
    "@media": {
      // 狭い画面では横並びを維持せず折り返す（潰れ・はみ出し防止）。
      "(max-width: 640px)": { flexWrap: "wrap" },
    },
  }),
  gap: styleVariants({
    none: { gap: 0 },
    sm: { gap: theme.space.sm },
    md: { gap: theme.space.md },
    lg: { gap: theme.space.lg },
  }),
  align: styleVariants({
    start: { alignItems: "flex-start" },
    center: { alignItems: "center" },
    end: { alignItems: "flex-end" },
    stretch: { alignItems: "stretch" },
  }),
  justify: styleVariants({
    start: { justifyContent: "flex-start" },
    center: { justifyContent: "center" },
    end: { justifyContent: "flex-end" },
    spaceBetween: { justifyContent: "space-between" },
  }),
  wrap: style({
    flexWrap: "wrap",
  }),
};

export default styles;
