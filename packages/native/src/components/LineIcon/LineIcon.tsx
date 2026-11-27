import { ReactNode } from "react";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";

export type LineIconName =
  | "agent"
  | "bill"
  | "book"
  | "building"
  | "chart"
  | "check"
  | "chevronRight"
  | "file"
  | "fileCheck"
  | "grid"
  | "image"
  | "import"
  | "menu"
  | "plus"
  | "receipt"
  | "send"
  | "settings"
  | "sparkles"
  | "user";

// 線画アイコンのパス集（24x24 グリッド）。色は呼び出し側が指定する。
const ICON_PATHS: Record<LineIconName, ReactNode> = {
  agent: (
    <Path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
  ),
  bill: (
    <>
      <Rect x="2" y="6" width="20" height="12" rx="2" />
      <Circle cx="12" cy="12" r="2" />
      <Path d="M6 12h.01" />
      <Path d="M18 12h.01" />
    </>
  ),
  book: (
    <>
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <Path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </>
  ),
  building: (
    <>
      <Rect x="4" y="2" width="16" height="20" rx="2" />
      <Path d="M9 22v-4h6v4" />
      <Path d="M8 6h.01" />
      <Path d="M12 6h.01" />
      <Path d="M16 6h.01" />
      <Path d="M8 10h.01" />
      <Path d="M12 10h.01" />
      <Path d="M16 10h.01" />
      <Path d="M8 14h.01" />
      <Path d="M12 14h.01" />
      <Path d="M16 14h.01" />
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
  chevronRight: <Path d="m9 6 6 6-6 6" />,
  file: (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <Polyline points="14 2 14 8 20 8" />
    </>
  ),
  fileCheck: (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 2v6h6" />
      <Path d="m9 15 2 2 4-4" />
    </>
  ),
  grid: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1.5" />
      <Rect x="14" y="3" width="7" height="7" rx="1.5" />
      <Rect x="3" y="14" width="7" height="7" rx="1.5" />
      <Rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="3" width="18" height="18" rx="2" />
      <Circle cx="8.5" cy="8.5" r="1.5" />
      <Polyline points="21 15 16 10 5 21" />
    </>
  ),
  import: (
    <>
      <Path d="M12 3v10" />
      <Path d="m8 9 4 4 4-4" />
      <Path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V17" />
    </>
  ),
  menu: (
    <>
      <Path d="M4 6h16" />
      <Path d="M4 12h16" />
      <Path d="M4 18h16" />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
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
  settings: (
    <>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkles: (
    <>
      <Path d="M9.94 15.5a2 2 0 0 0-1.44-1.44L2.37 12.48a.5.5 0 0 1 0-.96l6.13-1.58A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" />
      <Path d="M20 3v4" />
      <Path d="M22 5h-4" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.5 20.5c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
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
