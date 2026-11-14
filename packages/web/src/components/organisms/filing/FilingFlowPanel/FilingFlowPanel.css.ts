import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 現在のステップの丸印がふわりと跳ねる（画面を開いた直後に目を引く）。
const bounceIn = keyframes({
  "0%": { transform: "scale(0.6)" },
  "55%": { transform: "scale(1.18)" },
  "75%": { transform: "scale(0.96)" },
  "100%": { transform: "scale(1)" },
});

const styles = {
  // ステッパー全体（丸印の列＋連結線）。幅いっぱいに広げず、中央に寄せて余裕を持たせる。
  stepper: style({
    display: "flex",
    alignItems: "flex-start",
    width: "100%",
    maxWidth: "560px",
    margin: "0 auto",
  }),
  // 1ステップ分（丸印＋ラベル）。クリックで詳細を切り替える。
  step: style({
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space.xs,
    padding: 0,
    border: "none",
    background: "transparent",
    color: theme.color.textSubtle,
    fontFamily: "inherit",
    cursor: "pointer",
  }),
  // ステップ間の連結線。丸印の中心の高さに合わせる。
  connector: style({
    flex: "1 1 auto",
    minWidth: "16px",
    height: "3px",
    marginTop: "18px",
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.color.border,
    transition: "background-color 0.3s ease",
  }),
  connectorDone: style({
    backgroundColor: theme.color.accent,
  }),
  circle: style({
    width: "38px",
    height: "38px",
    borderRadius: theme.borderRadius.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeight.semibold,
    border: `2px solid ${theme.color.borderStrong}`,
    backgroundColor: theme.color.surface,
    color: theme.color.textSubtle,
    transition:
      "background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease",
  }),
  circleDone: style({
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
    color: theme.color.onAccent,
  }),
  // いま取り組むステップ。淡い面＋リング＋バウンスで示す。
  circleCurrent: style({
    borderColor: theme.color.accent,
    backgroundColor: theme.color.accentSoft,
    color: theme.color.accentText,
    boxShadow: `0 0 0 5px ${theme.color.accentSoft}`,
    animation: `${bounceIn} 0.6s ${theme.animation.spring}`,
  }),
  // 選択中のステップ（詳細カードに表示しているもの）。アウトラインで示す。
  circleSelected: style({
    outline: `2px solid ${theme.color.accent}`,
    outlineOffset: "2px",
  }),
  stepLabel: style({
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeight.medium,
    whiteSpace: "nowrap",
  }),
  stepLabelActive: style({
    color: theme.color.text,
    fontWeight: theme.fontWeight.semibold,
  }),
  stepState: style({
    fontSize: theme.fontSizes.xs,
    color: theme.color.muted,
    whiteSpace: "nowrap",
  }),
};

export default styles;
