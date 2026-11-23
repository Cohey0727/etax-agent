import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// スケルトンの明滅（読み込み中であることを静かに示す）。
const pulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.45 },
});

const styles = {
  root: style({
    display: "block",
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.color.lineSoft,
    animation: `${pulse} 1.4s ease-in-out infinite`,
  }),
};

export default styles;
