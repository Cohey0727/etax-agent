import { ScrollView } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { CashFlowMonth } from "@/api";
import { AppText, Card } from "@/components";
import { colors } from "@/theme";
import { formatYen } from "@/utils";

export interface BalanceChartProps {
  months: CashFlowMonth[];
}

const CHART_HEIGHT = 180;
const BASELINE_OFFSET = 24;
const COLUMN_PITCH = 44;
const BAR_WIDTH = 26;

/**
 * 月末残高の推移（SVGバーチャート）。ゼロを基準線として、正の残高は
 * 上向き、負の残高は下向きのバーで示す。
 */
export function BalanceChart({ months }: BalanceChartProps) {
  const max = Math.max(0, ...months.map((m) => m.closing_balance));
  const min = Math.min(0, ...months.map((m) => m.closing_balance));
  const range = max - min;
  const plotHeight = CHART_HEIGHT - BASELINE_OFFSET;
  const zeroY = range > 0 ? (max / range) * plotHeight : plotHeight;
  const width = Math.max(months.length * COLUMN_PITCH + 16, 320);
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        残高推移
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
          <Line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={colors.borderStrong} strokeWidth={1} />
          {months.map((row, index) => {
            const height = range > 0 ? Math.max((Math.abs(row.closing_balance) / range) * plotHeight, row.closing_balance !== 0 ? 2 : 0) : 0;
            const x = 8 + index * COLUMN_PITCH + (COLUMN_PITCH - BAR_WIDTH) / 2;
            const y = row.closing_balance >= 0 ? zeroY - height : zeroY;
            return (
              <G key={row.month}>
                <Rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={height}
                  rx={4}
                  fill={row.closing_balance >= 0 ? colors.accent : colors.negative}
                />
                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={CHART_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill={colors.muted}
                >
                  {Number(row.month.slice(5, 7))}月
                </SvgText>
                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={row.closing_balance >= 0 ? y - 4 : y + height + 12}
                  textAnchor="middle"
                  fontSize={8}
                  fill={colors.muted}
                >
                  {formatCompact(row.closing_balance)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>
      <AppText size="xs" tone="muted">
        各月の月末残高です。マイナスの月は残高不足を示します。
      </AppText>
    </Card>
  );
}

function formatCompact(value: number): string {
  if (Math.abs(value) < 10000) return formatYen(value);
  return `¥${Math.round(value / 10000).toLocaleString("ja-JP")}万`;
}
