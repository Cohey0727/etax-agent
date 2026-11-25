import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// ステップが上から順に弾んで現れる。
const stepIn = keyframes({
  "0%": { opacity: 0, transform: "translateX(-10px) scale(0.94)" },
  "100%": { opacity: 1, transform: "translateX(0) scale(1)" },
});

// 「処理中」を示すドットの明滅。
const pulse = keyframes({
  "0%": { opacity: 0.25, transform: "scale(0.8)" },
  "50%": { opacity: 1, transform: "scale(1.15)" },
  "100%": { opacity: 0.25, transform: "scale(0.8)" },
});

const stepDelay = styleVariants({
  stepDelay0: { animationDelay: "0.55s" },
  stepDelay1: { animationDelay: "0.7s" },
  stepDelay2: { animationDelay: "0.85s" },
  stepDelay3: { animationDelay: "1s" },
  stepDelay4: { animationDelay: "1.15s" },
  stepDelay5: { animationDelay: "1.3s" },
});

const dotDelay = styleVariants({
  dotDelay0: { animationDelay: "0s" },
  dotDelay1: { animationDelay: "0.18s" },
  dotDelay2: { animationDelay: "0.36s" },
});

const styles = {
  // 濃紺地の上に浮くガラス風カード。
  card: style({
    background: theme.color.navySoft,
    border: `1px solid ${theme.color.navySoft}`,
    borderRadius: theme.borderRadius.lg,
    padding: theme.space.md,
    backdropFilter: "blur(6px)",
  }),
  cardIcon: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: theme.borderRadius.sm,
    background: `linear-gradient(135deg, ${theme.color.gradientStart} 0%, ${theme.color.accent} 100%)`,
    color: theme.color.onAccent,
    flexShrink: 0,
  }),
  cardTitle: style({
    color: theme.color.onNavy,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: theme.letterSpacing.wide,
  }),
  dots: style({
    display: "inline-flex",
    gap: "4px",
  }),
  dot: style({
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: theme.color.lavender,
    animation: `${pulse} 1.4s ease-in-out infinite`,
  }),
  ...dotDelay,
  // 縦線を絶対配置するための受け皿（並び自体は Col atom が持つ）。
  steps: style({
    position: "relative",
  }),
  // ノードの中心を貫く縦線。グラデーションで流れの向きを示す。
  line: style({
    position: "absolute",
    left: "15px",
    top: "16px",
    bottom: "16px",
    width: "2px",
    borderRadius: theme.borderRadius.pill,
    background: `linear-gradient(180deg, ${theme.color.lavender} 0%, ${theme.color.accent} 100%)`,
    opacity: 0.55,
  }),
  step: style({
    position: "relative",
    animation: `${stepIn} 0.55s ${theme.animation.spring} both`,
  }),
  ...stepDelay,
  node: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: theme.color.navy,
    border: `1px solid ${theme.color.navySoft}`,
    color: theme.color.lavender,
    flexShrink: 0,
  }),
  stepLabel: style({
    color: theme.color.onNavy,
    fontWeight: theme.fontWeight.semibold,
    whiteSpace: "nowrap",
  }),
  stepCaption: style({
    color: theme.color.onNavySubtle,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};

export default styles;
