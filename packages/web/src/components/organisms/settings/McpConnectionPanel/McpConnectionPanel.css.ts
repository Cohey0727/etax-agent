import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 設定スニペット（JSON）を等幅で出すブロック。横スクロールで崩さない。
  codeBlock: style({
    margin: 0,
    padding: theme.space.md,
    background: theme.color.bg,
    borderRadius: theme.borderRadius.md,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: theme.fontSizes.sm,
    lineHeight: theme.lineHeight.normal,
    overflowX: "auto",
    whiteSpace: "pre",
  }),
  // ツール一覧は件数が多いので高さを絞ってスクロールさせる。
  toolList: style({
    maxHeight: "320px",
    overflowY: "auto",
  }),
};

export default styles;
