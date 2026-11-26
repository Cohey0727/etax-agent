/**
 * SorobanMark.tsx — そろばんの珠（4珠・2×2市松2トーン）のマーク。
 * 珠は双円錐で、上半分と下半分にトーン内の縦グラデーションを持つ。
 * tone "a" は上が白・下がラベンダー、tone "b" はその反転。
 */
import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

export type BeadTone = "a" | "b";

const BEAD_W = 215;
const BEAD_H = 152;

function BeadGradients({ idPrefix }: { idPrefix: string }) {
  return (
    <Defs>
      <LinearGradient id={`${idPrefix}-whiteTop`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#ffffff" />
        <Stop offset="1" stopColor="#e3deff" />
      </LinearGradient>
      <LinearGradient id={`${idPrefix}-whiteBot`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#ffffff" />
        <Stop offset="1" stopColor="#ece8ff" />
      </LinearGradient>
      <LinearGradient id={`${idPrefix}-lavTop`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#c0b6ff" />
        <Stop offset="1" stopColor="#8f84ff" />
      </LinearGradient>
      <LinearGradient id={`${idPrefix}-lavBot`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#b7adff" />
        <Stop offset="1" stopColor="#9d92ff" />
      </LinearGradient>
    </Defs>
  );
}

/** 珠1つ分（双円錐）。width を渡すと比率を保って描く。 */
export function SorobanBead({ tone, width }: { tone: BeadTone; width: number }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const height = (width * BEAD_H) / BEAD_W;
  const topFill = tone === "a" ? `url(#${rawId}-whiteTop)` : `url(#${rawId}-lavTop)`;
  const bottomFill = tone === "a" ? `url(#${rawId}-lavBot)` : `url(#${rawId}-whiteBot)`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${BEAD_W} ${BEAD_H}`}>
      <BeadGradients idPrefix={rawId} />
      <Polygon points={`107.5,0 215,76 0,76`} fill={topFill} />
      <Polygon points={`0,76 215,76 107.5,152`} fill={bottomFill} />
    </Svg>
  );
}

/** 4珠マーク全体（静的表示用）。 */
export function SorobanMark({ width }: { width: number }) {
  const beadWidth = width / 2;
  const beadHeight = (beadWidth * BEAD_H) / BEAD_W;
  return (
    <View style={{ width, height: beadHeight * 2 }}>
      <View style={{ flexDirection: "row" }}>
        <SorobanBead tone="a" width={beadWidth} />
        <SorobanBead tone="b" width={beadWidth} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <SorobanBead tone="b" width={beadWidth} />
        <SorobanBead tone="a" width={beadWidth} />
      </View>
    </View>
  );
}
