import { styleVariants } from "@vanilla-extract/css";

const styles = {
  align: styleVariants({
    left: {},
    right: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  }),
};

export default styles;
