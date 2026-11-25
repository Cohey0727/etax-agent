import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  label: style({
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.color.textSubtle,
  }),
  // アイコンと右端要素を入力欄に重ねるための受け皿。
  field: style({
    position: "relative",
  }),
  icon: style({
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    color: theme.color.muted,
    pointerEvents: "none",
  }),
  input: style({
    width: "100%",
  }),
  inputWithIcon: style({
    paddingLeft: "38px",
  }),
  inputWithTrailing: style({
    paddingRight: "44px",
  }),
};

export default styles;
