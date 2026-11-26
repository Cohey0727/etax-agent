import { ReactNode } from "react";
import Svg, { Path } from "react-native-svg";

export type LineIconName =
  | "book"
  | "chart"
  | "check"
  | "fileCheck"
  | "receipt"
  | "send"
  | "sparkles";

// 線画アイコンのパス集（24x24 グリッド）。色は呼び出し側が指定する。
const ICON_PATHS: Record<LineIconName, ReactNode> = {
  book: (
    <>
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <Path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </>
  ),
  chart: (
    <>
      <Path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <Path d="M7 15v3" />
      <Path d="M12 10v8" />
      <Path d="M17 6v12" />
    </>
  ),
  check: <Path d="M20 6 9 17l-5-5" />,
  fileCheck: (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 2v6h6" />
      <Path d="m9 15 2 2 4-4" />
    </>
  ),
  receipt: (
    <>
      <Path d="M6 2h12v20l-2-1.4L14 22l-2-1.4L10 22l-2-1.4L6 22Z" />
      <Path d="M9 7h6" />
      <Path d="M9 11h6" />
    </>
  ),
  send: (
    <>
      <Path d="m22 2-7 20-4-9-9-4Z" />
      <Path d="M22 2 11 13" />
    </>
  ),
  sparkles: (
    <>
      <Path d="M9.94 15.5a2 2 0 0 0-1.44-1.44L2.37 12.48a.5.5 0 0 1 0-.96l6.13-1.58A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" />
      <Path d="M20 3v4" />
      <Path d="M22 5h-4" />
    </>
  ),
};

export interface LineIconProps {
  name: LineIconName;
  size?: number;
  color: string;
}

/** 線画アイコン。輪郭のみで描き、塗りは持たない。 */
export function LineIcon({ name, size = 18, color }: LineIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </Svg>
  );
}
