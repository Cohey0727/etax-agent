import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// カードの登場（Card atom と同じ弾み）。
const popIn = keyframes({
  "0%": { opacity: 0, transform: "scale(0.96) translateY(10px)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

// モード切替で中身が下から弾んで入れ替わる。
const modeIn = keyframes({
  "0%": { opacity: 0, transform: "translateY(12px) scale(0.99)" },
  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
});

// エラーは小さく震えて知らせる。
const shake = keyframes({
  "0%": { transform: "translateX(0)" },
  "20%": { transform: "translateX(-7px)" },
  "40%": { transform: "translateX(6px)" },
  "60%": { transform: "translateX(-4px)" },
  "80%": { transform: "translateX(3px)" },
  "100%": { transform: "translateX(0)" },
});

const styles = {
  root: style({
    flex: "54 1 0%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.lg,
    background: theme.color.bg,
    "@media": {
      "(max-width: 900px)": { flex: "none", width: "100%" },
    },
  }),
  card: style({
    width: "100%",
    maxWidth: "440px",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: theme.space.xl,
    boxShadow: theme.shadow.card,
    animation: `${popIn} 0.5s ${theme.animation.springSoft} both`,
    "@media": {
      "(max-width: 900px)": { padding: theme.space.lg },
    },
  }),
  caption: style({
    fontSize: theme.fontSizes.sm,
  }),
  errorWrap: style({
    animation: `${shake} 0.45s ease both`,
  }),
  modeContent: style({
    animation: `${modeIn} 0.45s ${theme.animation.springSoft} both`,
  }),
  footer: style({
    textAlign: "center",
    borderTop: `1px solid ${theme.color.lineSoft}`,
    paddingTop: theme.space.md,
  }),
};

export default styles;
