import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 手順の番号バッジ。ステップの並びが一目で分かるよう丸で囲む。
  stepNumber: style({
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    marginTop: "1px",
    borderRadius: "50%",
    background: theme.color.accent,
    color: theme.color.onAccent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
