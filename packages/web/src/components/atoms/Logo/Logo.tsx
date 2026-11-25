import { ReactNode, useId } from "react";
import { clsx } from "clsx";
import styles from "./Logo.css";

export type LogoVariant = "mark" | "icon" | "banner";
export type LogoTone = "brand" | "reversed" | "auto";

export interface LogoProps {
  /**
   * 形: mark=珠のみ（背景なし）/ icon=角丸グラデーション背景つき / banner=横組み（アイコン＋ワードマーク）
   * @default "mark"
   */
  variant?: LogoVariant;
  /**
   * 色調: brand=ブランド色 / reversed=濃い面用（白・ラベンダー）/ auto=テーマで切替（ダークでは reversed 相当）
   * icon は背景込みのため tone の指定は珠の色調にのみ効く（常に reversed 相当）。
   * @default variant により mark="auto" / banner="brand"
   */
  tone?: LogoTone;
  /** mark / icon は一辺、banner は高さ（px）。 */
  size?: number;
  className?: string;
}

// 珠の geometry は正本（files/logo/build_final.py）の 1024 グリッドそのまま。
// 4つの珠（菱形・上下円錐）を市松 2 トーンで並べ、点で接する構成。
type ConeFill = "coneTop" | "coneBottom" | "lavender" | "accentToOnNavy";

const CONES: readonly { d: string; fill: ConeFill }[] = [
  { d: "M297 208 L512 360 L82 360 Z", fill: "coneTop" },
  { d: "M82 360 L512 360 L297 512 Z", fill: "coneBottom" },
  { d: "M727 208 L942 360 L512 360 Z", fill: "lavender" },
  { d: "M512 360 L942 360 L727 512 Z", fill: "accentToOnNavy" },
  { d: "M297 512 L512 664 L82 664 Z", fill: "lavender" },
  { d: "M82 664 L512 664 L297 816 Z", fill: "accentToOnNavy" },
  { d: "M727 512 L942 664 L512 664 Z", fill: "coneTop" },
  { d: "M512 664 L942 664 L727 816 Z", fill: "coneBottom" },
];

interface GradientIds {
  brand: string;
  coneTop: string;
  coneBottom: string;
}

// ロゴ固有のブランドグラデーション（正本 SVG の色をそのまま保持する資産色）。
const LogoDefs = ({ ids }: { ids: GradientIds }) => (
  <defs>
    <linearGradient id={ids.brand} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#18124d" />
      <stop offset="0.55" stopColor="#2a1c96" />
      <stop offset="1" stopColor="#4a3aff" />
    </linearGradient>
    <linearGradient id={ids.coneTop} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#6a5cff" />
      <stop offset="1" stopColor="#4a3aff" />
    </linearGradient>
    <linearGradient id={ids.coneBottom} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#2a1c96" />
      <stop offset="1" stopColor="#18124d" />
    </linearGradient>
  </defs>
);

// 円錐の塗りを tone で引く。brand / auto はグラデーション属性 + テーマ連動クラス、
// reversed は単色クラスのみ（濃い面専用でテーマに依らず固定）。
const coneProps = (
  fill: ConeFill,
  tone: LogoTone,
  ids: GradientIds,
): { fill?: string; className?: string } => {
  const table: Record<ConeFill, Record<LogoTone, { fill?: string; className?: string }>> = {
    coneTop: {
      brand: { fill: `url(#${ids.coneTop})` },
      auto: { fill: `url(#${ids.coneTop})`, className: styles.autoConeTop },
      reversed: { className: styles.fillOnNavy },
    },
    coneBottom: {
      brand: { fill: `url(#${ids.coneBottom})` },
      auto: { fill: `url(#${ids.coneBottom})`, className: styles.autoConeBottom },
      reversed: { className: styles.fillLavender },
    },
    lavender: {
      brand: { className: styles.fillLavender },
      auto: { className: styles.fillLavender },
      reversed: { className: styles.fillLavender },
    },
    accentToOnNavy: {
      brand: { className: styles.fillAccent },
      auto: { className: styles.autoAccentToOnNavy },
      reversed: { className: styles.fillOnNavy },
    },
  };
  return table[fill][tone];
};

const Beads = ({ tone, ids }: { tone: LogoTone; ids: GradientIds }) => (
  <>
    {CONES.map((cone) => (
      <path key={cone.d} d={cone.d} {...coneProps(cone.fill, tone, ids)} />
    ))}
  </>
);

// アイコン（角丸背景 + 76% に収めた珠）。正本 icon.svg と同じ構成。
const IconArt = ({ ids }: { ids: GradientIds }) => (
  <>
    <rect x="64" y="64" width="896" height="896" rx="208" fill={`url(#${ids.brand})`} />
    <g transform="translate(512 512) scale(0.76) translate(-512 -512)">
      <Beads tone="reversed" ids={ids} />
    </g>
  </>
);

// ワードマークは「e」だけ色を変える（brand: accent / 紺、reversed: ラベンダー / 白）。
const Wordmark = ({ tone }: { tone: LogoTone }) => {
  const dark = tone === "reversed";
  return (
    <text
      x="292"
      y="176"
      fontFamily="'Noto Sans','Noto Sans JP',sans-serif"
      fontSize="148"
      fontWeight="900"
      letterSpacing="-2"
    >
      <tspan className={dark ? styles.fillLavender : styles.fillAccent}>e</tspan>
      <tspan className={dark ? styles.fillOnNavy : styles.fillNavy}>TaxAgent</tspan>
    </text>
  );
};

interface VariantSpec {
  viewBox: string;
  /** size 1px あたりの表示幅（高さ基準で拡縮する）。 */
  widthRatio: number;
  render: (ids: GradientIds, tone: LogoTone) => ReactNode;
}

const VARIANTS: Record<LogoVariant, VariantSpec> = {
  mark: {
    viewBox: "0 0 1024 1024",
    widthRatio: 1,
    render: (ids, tone) => <Beads tone={tone} ids={ids} />,
  },
  icon: {
    viewBox: "0 0 1024 1024",
    widthRatio: 1,
    render: (ids) => <IconArt ids={ids} />,
  },
  banner: {
    viewBox: "0 0 1240 256",
    widthRatio: 1240 / 256,
    render: (ids, tone) => (
      <>
        <g transform="translate(8 8) scale(0.234375)">
          <IconArt ids={ids} />
        </g>
        <Wordmark tone={tone} />
      </>
    ),
  },
};

const DEFAULT_TONES: Record<LogoVariant, LogoTone> = {
  mark: "auto",
  icon: "reversed",
  banner: "brand",
};

/**
 * Logo — eTaxAgent のブランドマーク（atoms）。
 * 正本アセット（files/logo/）の geometry をインライン SVG で描画する。
 * 静的ファイルが要る場所（favicon・PWA・OGP 等）は public/ のアセットを使う。
 */
export const Logo = ({ variant = "mark", tone, size = 38, className }: LogoProps) => {
  const uid = useId().replace(/:/g, "");
  const ids: GradientIds = {
    brand: `logo-brand-${uid}`,
    coneTop: `logo-cone-top-${uid}`,
    coneBottom: `logo-cone-bottom-${uid}`,
  };
  const spec = VARIANTS[variant];
  const resolvedTone = tone ?? DEFAULT_TONES[variant];
  return (
    <svg
      role="img"
      aria-label="eTaxAgent"
      viewBox={spec.viewBox}
      width={Math.round(size * spec.widthRatio)}
      height={size}
      className={clsx(styles.root, className)}
    >
      <title>eTaxAgent</title>
      <LogoDefs ids={ids} />
      {spec.render(ids, resolvedTone)}
    </svg>
  );
};
