import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

// ロゴの塗りはテーマトークン経由が原則（ダークテーマではトークン値ごと切り替わる）。
// auto トーンのダーク上書きは、正本 mark.svg のダーク相当（reversed）の色味に寄せる。
const DARK_ROOT = ":root[data-theme=\"dark\"] &";

const styles = {
  root: style({
    flexShrink: 0,
    display: "block",
  }),
  // 珠の単色フィル（トークン）。
  fillAccent: style({ fill: theme.color.accent }),
  fillLavender: style({ fill: theme.color.lavender }),
  fillOnNavy: style({ fill: theme.color.onNavy }),
  fillNavy: style({ fill: theme.color.navy }),
  // auto: ライトでは accent、ダークでは白（reversed の下円錐相当）。
  autoAccentToOnNavy: style({
    fill: theme.color.accent,
    selectors: { [DARK_ROOT]: { fill: theme.color.onNavy } },
  }),
  // auto: ライトではグラデーション（属性 fill）、ダークでは単色に差し替える。
  autoConeTop: style({
    selectors: { [DARK_ROOT]: { fill: theme.color.onNavy } },
  }),
  autoConeBottom: style({
    selectors: { [DARK_ROOT]: { fill: theme.color.lavender } },
  }),
};

export default styles;
