import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 送信完了のアイコンがぽよんと弾んで現れる。
const popIn = keyframes({
  "0%": { opacity: 0, transform: "scale(0.5)" },
  "60%": { opacity: 1, transform: "scale(1.12)" },
  "100%": { opacity: 1, transform: "scale(1)" },
});

const styles = {
  iconCircle: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: theme.color.accentSoft,
    color: theme.color.accent,
    animation: `${popIn} 0.55s ${theme.animation.spring} both`,
  }),
  message: style({
    textAlign: "center",
    color: theme.color.textSubtle,
    lineHeight: theme.lineHeight.normal,
  }),
};

export default styles;
