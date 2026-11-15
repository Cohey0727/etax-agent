import { style } from "@vanilla-extract/css";

const styles = {
  // 選択肢の文言が長いので、ある程度の幅を確保しつつ画面幅には収める。
  select: style({
    minWidth: "260px",
    maxWidth: "100%",
  }),
};

export default styles;
