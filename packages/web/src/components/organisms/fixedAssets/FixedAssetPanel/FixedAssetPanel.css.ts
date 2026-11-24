import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// カードや詳細の出現アニメーション（小さく跳ねる）。
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
  // サマリ帯（件数・取得価額・償却費・期末簿価）の並び。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: theme.space.md,
  }),
  // 少額特例の使用状況バー。
  progressTrack: style({
    width: "100%",
    height: "10px",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.accentSoft,
    overflow: "hidden",
  }),
  progressFill: style({
    height: "100%",
    borderRadius: theme.borderRadius.pill,
    background: `linear-gradient(90deg, ${theme.color.gradientStart}, ${theme.color.accent})`,
    transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
  }),
  progressFillExceeded: style({
    background: theme.color.negative,
  }),
  // 資産カードの並び。
  assetGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: theme.space.md,
  }),
  assetCard: style({
    textAlign: "left",
    width: "100%",
    cursor: "pointer",
    animation: `${popIn} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)`,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    selectors: {
      "&:hover": { transform: "translateY(-2px)" },
    },
  }),
  assetCardSelected: style({
    outline: `2px solid ${theme.color.accent}`,
    outlineOffset: "-2px",
  }),
  thumb: style({
    width: "64px",
    height: "64px",
    borderRadius: theme.borderRadius.md,
    objectFit: "cover",
    background: theme.color.accentSoft,
    flexShrink: 0,
  }),
  thumbPlaceholder: style({
    width: "64px",
    height: "64px",
    borderRadius: theme.borderRadius.md,
    background: theme.color.accentSoft,
    color: theme.color.accent,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  // 償却プログレス（カード内）。
  miniProgressTrack: style({
    width: "100%",
    height: "6px",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.lineSoft,
    overflow: "hidden",
  }),
  miniProgressFill: style({
    height: "100%",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.accent,
    transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
  }),
  // 詳細パネル。
  detailCard: style({
    animation: `${popIn} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)`,
  }),
  tableWrap: style({
    width: "100%",
    overflowX: "auto",
  }),
  scheduleRowCurrent: style({
    background: theme.color.accentSoft,
    fontWeight: 600,
  }),
  // 画像ギャラリー。
  galleryGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: theme.space.sm,
  }),
  galleryItem: style({
    position: "relative",
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    border: `1px solid ${theme.color.border}`,
    aspectRatio: "1",
    background: theme.color.accentSoft,
  }),
  galleryImage: style({
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    cursor: "zoom-in",
  }),
  galleryDelete: style({
    position: "absolute",
    top: "6px",
    right: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: theme.borderRadius.pill,
    border: "none",
    background: "rgba(20, 18, 50, 0.72)",
    color: "#ffffff",
    cursor: "pointer",
  }),
  // 拡大表示（ライトボックス）。
  lightbox: style({
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "rgba(15, 13, 40, 0.82)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.lg,
    cursor: "zoom-out",
    animation: `${popIn} 0.25s ease`,
  }),
  lightboxImage: style({
    maxWidth: "92vw",
    maxHeight: "88vh",
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadow.card,
    objectFit: "contain",
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
  chipRow: style({
    display: "flex",
    flexWrap: "wrap",
    gap: theme.space.xs,
    marginTop: "6px",
  }),
  hiddenFileInput: style({
    display: "none",
  }),
  skeleton: style({
    background: theme.color.lineSoft,
    borderRadius: theme.borderRadius.md,
    animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  }),
  skeletonTitle: style({ width: "180px", height: "28px" }),
  skeletonValue: style({ width: "70%", height: "24px" }),
  skeletonLabel: style({ width: "45%", height: "14px" }),
  skeletonCard: style({ height: "132px" }),
  skeletonDetail: style({ height: "320px" }),
};

export default styles;
