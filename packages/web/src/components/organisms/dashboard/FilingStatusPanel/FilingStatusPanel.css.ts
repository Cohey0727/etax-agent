import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // ステッパー全体（丸印の列＋連結線）。端から端まで広げず、確定申告画面と
  // 同じく中央に寄せて余裕を持たせる。
  stepper: style({
    display: "flex",
    alignItems: "flex-start",
    width: "100%",
    maxWidth: "560px",
    margin: "0 auto",
  }),
  // 1ステップ分（丸印＋ラベル＋状態）。表示専用なのでクリックはさせない。
  step: style({
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space.xs,
    color: theme.color.textSubtle,
  }),
  // ステップ間の連結線。丸印の中心の高さに合わせる。
  connector: style({
    flex: "1 1 auto",
    minWidth: "16px",
    height: "3px",
    marginTop: "15px",
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.color.border,
    transition: "background-color 0.3s ease",
  }),
  connectorDone: style({
    backgroundColor: theme.color.accent,
  }),
  // ステップの丸印。済みはアクセント色で塗り、チェックを表示する。
  circle: style({
    width: "32px",
    height: "32px",
    borderRadius: theme.borderRadius.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: theme.fontSizes.sm,
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
  // いま取り組むステップ（最初の未完了）。淡い面＋リングで示す。
  circleCurrent: style({
    borderColor: theme.color.accent,
    backgroundColor: theme.color.accentSoft,
    color: theme.color.accentText,
    boxShadow: `0 0 0 4px ${theme.color.accentSoft}`,
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
