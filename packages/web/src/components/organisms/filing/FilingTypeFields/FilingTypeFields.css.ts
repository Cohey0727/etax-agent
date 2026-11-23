import { style } from "@vanilla-extract/css";

const styles = {
  // ラベルは幅を固定して、並ぶセレクタの左端が揃うようにする
  // （一番長い「不動産貸付けの規模」が収まる幅）。
  label: style({
    width: "150px",
    flexShrink: 0,
  }),
  // 選択肢の文言が長いので、ある程度の幅を確保しつつ画面幅には収める。
  select: style({
    minWidth: "260px",
    maxWidth: "100%",
  }),
};

export default styles;
