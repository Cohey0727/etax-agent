import { style, styleVariants } from "@vanilla-extract/css";
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
  size: styleVariants({
    md: {},
    // 単独フォーム用にひと回り大きく（高さ・文字）。
    lg: { height: "46px", fontSize: theme.fontSizes.base },
  }),
  inputWithIcon: style({
    paddingLeft: "38px",
  }),
  inputWithTrailing: style({
    paddingRight: "44px",
  }),
};

export default styles;
