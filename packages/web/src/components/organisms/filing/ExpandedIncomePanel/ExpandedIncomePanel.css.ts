import { style } from "@vanilla-extract/css";

const styles = {
  // 入力欄のラベル列。幅を固定して入力欄の左端を揃える（MiscIncomePanel と同じ）。
  fieldLabel: style({
    flex: "0 0 210px",
    display: "flex",
    alignItems: "center",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
  }),
  // 金額の入力欄。数字を右寄せにする。
  fieldInput: style({
    flex: "1 1 auto",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
    textAlign: "right",
  }),
  // テキストの入力欄（名称など、左寄せ）。
  fieldText: style({
    flex: "1 1 auto",
    "@media": {
      "(max-width: 640px)": { flex: "1 1 100%" },
    },
  }),
  // 計算結果の金額表示（右寄せ）。
  resultValue: style({
    flex: "1 1 auto",
    textAlign: "right",
  }),
};

export default styles;
