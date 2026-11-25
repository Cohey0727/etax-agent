import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// カードの出現アニメーション（小さく跳ねる）。
const popIn = keyframes({
  "0%": { opacity: 0, transform: "scale(0.97) translateY(6px)" },
  "60%": { opacity: 1, transform: "scale(1.01) translateY(0)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

// スケルトンの明滅。
const skeletonPulse = keyframes({
  "0%": { opacity: 0.5 },
  "50%": { opacity: 1 },
  "100%": { opacity: 0.5 },
});

const styles = {
  // 請求書カードの並び。
  cardGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: theme.space.md,
  }),
  invoiceCard: style({
    textAlign: "left",
    width: "100%",
    cursor: "pointer",
    animation: `${popIn} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)`,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    selectors: {
      "&:hover": { transform: "translateY(-2px)" },
    },
  }),
  // 検索バーの並び。
  searchGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: theme.space.md,
    alignItems: "end",
  }),
  // 登録・編集フォーム。
  formGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: theme.space.md,
  }),
  fieldLabel: style({
    display: "block",
    fontSize: "12px",
    color: theme.color.muted,
    marginBottom: "4px",
  }),
  checkLabel: style({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "13px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  }),
  // 明細行の入力グリッド（品目・数量・単位・単価・税率・軽減・金額・削除）。
  lineGrid: style({
    display: "grid",
    gridTemplateColumns: "minmax(140px, 2fr) 70px 56px 100px 96px 64px 96px 36px",
    gap: theme.space.sm,
    alignItems: "end",
  }),
  lineAmount: style({
    textAlign: "right",
    fontSize: "13px",
    paddingBottom: "8px",
    whiteSpace: "nowrap",
  }),
  tableWrap: style({
    width: "100%",
    overflowX: "auto",
  }),
  amountCell: style({
    textAlign: "right",
    whiteSpace: "nowrap",
  }),
  skeleton: style({
    background: theme.color.lineSoft,
    borderRadius: theme.borderRadius.md,
    animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  }),
  skeletonTitle: style({ width: "180px", height: "28px" }),
  skeletonCard: style({ height: "120px" }),
};

export default styles;
