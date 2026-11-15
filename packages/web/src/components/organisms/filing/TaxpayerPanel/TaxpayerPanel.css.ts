import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // 入力欄のラベル列。幅を固定して入力欄の左端を揃える。
  fieldLabel: style({
    flex: "0 0 210px",
    display: "flex",
    alignItems: "center",
    "@media": {
      // 狭い画面ではラベルを入力欄の上に積む（210px固定だと入力欄が潰れるため）。
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
  }),
  // テキスト入力欄。
  fieldInput: style({
    flex: "1 1 auto",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
  }),
  // 金額の入力欄。数字を右寄せにする。
  fieldNumber: style({
    flex: "1 1 auto",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
    textAlign: "right",
  }),
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
  // e-Taxサイトへのリンク。ボタン状にして提出の動線として目立たせる。
  etaxLink: style({
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    borderRadius: theme.borderRadius.md,
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    fontWeight: theme.fontWeight.semibold,
    textDecoration: "none",
    transition: `background 0.2s ease, transform 0.25s ${theme.animation.spring}`,
    selectors: {
      "&:hover": {
        background: theme.color.hover,
        transform: "translateY(-1px)",
      },
    },
  }),
};

export default styles;
