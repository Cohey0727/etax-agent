import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const chevronBase = {
  display: "inline-flex",
  transition: `transform ${theme.animation.durationBase} ${theme.animation.springSoft}`,
} as const;

const styles = {
  // 開閉の矢印。閉じているときは右向き（-90度）にして「開ける」ことを示す。
  chevron: style({
    ...chevronBase,
    transform: "rotate(-90deg)",
  }),
  chevronOpen: style({
    ...chevronBase,
    transform: "rotate(0deg)",
  }),
  // 開いた内訳の本体。見出しの分だけ少し字下げして、見出しにぶら下がって見えるようにする。
  body: style({
    paddingLeft: "12px",
  }),
  // 名称は残りの幅いっぱいに広げる。
  recipient: style({
    flex: 1,
    minWidth: 0,
  }),
  // 金額は固定幅。
  amount: style({
    width: "150px",
    flexShrink: 0,
  }),
};

export default styles;
