import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // ステップ左側（丸印＋ラベル＋詳細）を伸ばして、ボタンを右端へ寄せる。
  grow: style({
    flex: "1 1 auto",
  }),
  // ステップの丸印。済みはアクセント色で塗り、チェックを表示する。
  dot: style({
    flex: "0 0 auto",
    width: "24px",
    height: "24px",
    borderRadius: theme.borderRadius.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: theme.fontWeight.semibold,
    border: `2px solid ${theme.color.borderStrong}`,
    color: "transparent",
    backgroundColor: "transparent",
    transition: "background-color 0.25s ease, border-color 0.25s ease, transform 0.25s ease",
  }),
  dotDone: style({
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
    color: theme.color.onAccent,
    transform: "scale(1.05)",
  }),
  // ステップ名。幅を固定して詳細の左端を揃える。
  stepLabel: style({
    flex: "0 0 92px",
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
