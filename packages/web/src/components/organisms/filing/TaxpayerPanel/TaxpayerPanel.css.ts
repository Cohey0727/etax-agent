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
  // グループ見出し。
  subhead: style({
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.textSubtle,
  }),
  // 金額は等幅数字で桁を揃える。
  amount: style({
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  }),
  // 第3期分の行。区切り線と太字で締める。
  totalRow: style({
    borderTop: `2px solid ${theme.color.borderStrong}`,
    paddingTop: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
  }),
};

export default styles;
