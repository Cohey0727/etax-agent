import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// 登場時に下からふわりと弾んで現れる。
const riseIn = keyframes({
  "0%": { opacity: 0, transform: "translateY(18px) scale(0.98)" },
  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
});

// ブランドマークの小さな浮遊（サイドバーと同じ動き）。
const bob = keyframes({
  "0%": { transform: "translateY(0)" },
  "50%": { transform: "translateY(-3px)" },
  "100%": { transform: "translateY(0)" },
});

const popIn = keyframes({
  "0%": { transform: "scale(0.6)" },
  "60%": { transform: "scale(1.12)" },
  "100%": { transform: "scale(1)" },
});

const riseDelay = styleVariants({
  riseDelay0: { animationDelay: "0.05s" },
  riseDelay1: { animationDelay: "0.16s" },
  riseDelay2: { animationDelay: "0.3s" },
  riseDelay3: { animationDelay: "0.44s" },
  riseDelay4: { animationDelay: "0.62s" },
});

const styles = {
  root: style({
    position: "relative",
    overflow: "hidden",
    display: "flex",
    background: `linear-gradient(165deg, ${theme.color.navy} 0%, ${theme.color.navyDeep} 80%)`,
    color: theme.color.onNavy,
    padding: theme.space.xxl,
    "@media": {
      "(max-width: 900px)": { padding: theme.space.lg },
    },
  }),
  // 罫線グリッドの装飾。下に向けて消える。
  grid: style({
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(${theme.color.navySoft} 1px, transparent 1px), linear-gradient(90deg, ${theme.color.navySoft} 1px, transparent 1px)`,
    backgroundSize: "44px 44px",
    maskImage: "linear-gradient(180deg, black 0%, transparent 88%)",
    WebkitMaskImage: "linear-gradient(180deg, black 0%, transparent 88%)",
    pointerEvents: "none",
  }),
  // ラベンダーとアクセントのグロー（色つき要素をぼかして作る）。
  glowTop: style({
    position: "absolute",
    top: "-140px",
    right: "-100px",
    width: "460px",
    height: "460px",
    borderRadius: "50%",
    background: theme.color.lavender,
    opacity: 0.26,
    filter: "blur(120px)",
    pointerEvents: "none",
  }),
  glowBottom: style({
    position: "absolute",
    bottom: "-180px",
    left: "-120px",
    width: "420px",
    height: "420px",
    borderRadius: "50%",
    background: theme.color.accent,
    opacity: 0.3,
    filter: "blur(130px)",
    pointerEvents: "none",
  }),
  content: style({
    position: "relative",
    zIndex: 1,
    flex: 1,
    maxWidth: "560px",
    margin: "0 auto",
    width: "100%",
  }),
  rise: style({
    animation: `${riseIn} 0.7s ${theme.animation.springSoft} both`,
  }),
  ...riseDelay,
  brandMark: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: theme.component.brandMarkSize,
    height: theme.component.brandMarkSize,
    borderRadius: "11px",
    background: `linear-gradient(135deg, ${theme.color.gradientStart} 0%, ${theme.color.accent} 100%)`,
    color: theme.color.onAccent,
    boxShadow: theme.shadow.button,
    flexShrink: 0,
    animation: `${popIn} 0.5s ${theme.animation.spring} both, ${bob} 3.2s ease-in-out 0.7s infinite`,
  }),
  brandTitle: style({ color: theme.color.onNavy }),
  brandCaption: style({ color: theme.color.onNavySubtle }),
  headline: style({
    color: theme.color.onNavy,
    "@media": {
      "(max-width: 900px)": { fontSize: theme.fontSizes.xxl },
    },
  }),
  headlineAccent: style({
    color: theme.color.lavender,
  }),
  lead: style({
    color: theme.color.onNavySubtle,
    fontSize: theme.fontSizes.lg,
    lineHeight: theme.lineHeight.normal,
  }),
  values: style({
    "@media": {
      "(max-width: 900px)": { display: "none" },
    },
  }),
  valueIcon: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: theme.color.navySoft,
    color: theme.color.lavender,
    flexShrink: 0,
    marginTop: "1px",
  }),
  valueText: style({
    color: theme.color.onNavy,
    lineHeight: theme.lineHeight.snug,
  }),
  workflow: style({
    "@media": {
      "(max-width: 900px)": { display: "none" },
    },
  }),
  note: style({
    color: theme.color.onNavySubtle,
    borderTop: `1px solid ${theme.color.navySoft}`,
    paddingTop: theme.space.md,
  }),
};

export default styles;
