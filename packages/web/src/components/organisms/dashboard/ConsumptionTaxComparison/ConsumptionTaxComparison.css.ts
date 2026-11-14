import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// バーは表示時にバネで伸びる（少し行き過ぎて戻る、scaleX なので行レイアウトに影響しない）。
const growBounce = keyframes({
  "0%": { transform: "scaleX(0)" },
  "70%": { transform: "scaleX(1.03)" },
  "100%": { transform: "scaleX(1)" },
});

const styles = {
  barRow: style({
    display: "grid",
    gridTemplateColumns: "150px 1fr 110px",
    alignItems: "center",
    gap: "12px",
    "@media": {
      // 狭い画面では方式名／バー／金額を縦に積む（150px+110px固定だとバーが潰れるため）。
      "(max-width: 640px)": { gridTemplateColumns: "1fr" },
    },
  }),
  barTrack: style({
    background: theme.color.lineSoft,
    borderRadius: theme.borderRadius.pill,
    height: theme.component.barHeight,
    overflow: "hidden",
  }),
  barFill: style({
    display: "block",
    height: "100%",
    borderRadius: theme.borderRadius.pill,
    transformOrigin: "left center",
    animation: `${growBounce} 0.8s ${theme.animation.springSoft} both`,
    transition: `width 0.45s ${theme.animation.spring}`,
  }),
  barFillColor: styleVariants({
    standard: { background: theme.color.barStandard },
    simplified: { background: theme.color.barSimplified },
    special20: { background: theme.color.barSpecial },
  }),
  barAmount: style({
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    "@media": {
      "(max-width: 640px)": { textAlign: "left" },
    },
  }),
};

export default styles;
