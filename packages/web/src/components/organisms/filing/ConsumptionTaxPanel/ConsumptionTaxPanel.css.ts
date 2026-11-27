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
  // 帳簿集計の読み取り専用の金額。入力欄と左端を揃え、右寄せ＋等幅数字。
  amountValue: style({
    flex: "1 1 auto",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
  }),
  // 計算結果の裏付け行で、金額の列まで空けるためのスペーサー（ラベル列と同じ幅）。
  backingSpacer: style({
    flex: "0 0 210px",
    "@media": {
      "(max-width: 640px)": { display: "none" },
    },
  }),
  // 計算結果の裏付け（項目の直下に、金額の列に揃えて出す）。
  resultBacking: style({
    flex: "1 1 auto",
    fontSize: theme.fontSizes.xs,
  }),
};

export default styles;
