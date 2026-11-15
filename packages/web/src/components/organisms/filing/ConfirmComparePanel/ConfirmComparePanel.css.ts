import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 比較ブロックの見出し。
  title: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
  // 前回値 → 現在値の金額表示。桁を揃えるため等幅寄りにする。
  amount: style({
    fontVariantNumeric: "tabular-nums",
  }),
  // 差額（変更なし）。
  delta: style({
    minWidth: "96px",
    textAlign: "right",
    color: theme.color.muted,
    fontVariantNumeric: "tabular-nums",
  }),
  // 差額（変更あり）。目立たせる。
  deltaChanged: style({
    minWidth: "96px",
    textAlign: "right",
    color: theme.color.accentText,
    fontWeight: theme.fontWeight.semibold,
    fontVariantNumeric: "tabular-nums",
  }),
};

export default styles;
