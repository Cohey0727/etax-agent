import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // コードは大きく・中央・等幅寄せで打ち込む。
  codeInput: style({
    textAlign: "center",
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: "0.32em",
  }),
  submit: style({
    width: "100%",
    height: "46px",
    fontSize: theme.fontSizes.base,
  }),
};

export default styles;
