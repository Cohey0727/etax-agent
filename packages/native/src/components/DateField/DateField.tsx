import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme";
import { AppButton } from "../AppButton";
import { AppText } from "../AppText";
import { BouncePressable } from "../BouncePressable";
import { Sheet } from "../Sheet";
import {
  dateDisplayLabel, daysInMonth, firstWeekday, formatDateValue,
  parseDateValue, shiftMonth, todayParts,
} from "./calendar";

export interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD" 形式。未選択は ""。 */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** 未選択（クリア）を許可する。 */
  clearable?: boolean;
}

const WEEKDAY_LABELS: readonly string[] = ["日", "月", "火", "水", "木", "金", "土"];
const YEAR_RANGE = 15;

/**
 * 日付入力。タップでカレンダーのボトムシートを開く。
 * 年はチップ、月は前後ボタンとチップ、日はカレンダーグリッドで選ぶ。
 */
export function DateField({ label, value, onChange, hint, clearable }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const base = selected ?? todayParts();
    return { year: base.year, month: base.month };
  });

  const openPicker = () => {
    const base = parseDateValue(value) ?? todayParts();
    setView({ year: base.year, month: base.month });
    setOpen(true);
  };

  const pickDay = (day: number) => {
    onChange(formatDateValue({ year: view.year, month: view.month, day }));
    setOpen(false);
  };

  const today = todayParts();
  const years: number[] = [];
  for (let y = today.year - YEAR_RANGE; y <= today.year + YEAR_RANGE; y += 1) years.push(y);
  const dayCount = daysInMonth(view.year, view.month);
  const offset = firstWeekday(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.wrap}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {label}
      </AppText>
      <BouncePressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? dateDisplayLabel(selected) : "未選択"}`}
        onPress={openPicker}
        style={styles.box}
        pressScale={0.98}
      >
        <AppText size="md" numberOfLines={1} style={styles.value} tone={selected ? "text" : "muted"}>
          {selected ? dateDisplayLabel(selected) : "日付を選ぶ"}
        </AppText>
        <AppText size="md" tone="muted">
          ▾
        </AppText>
      </BouncePressable>
      {hint ? (
        <AppText size="xs" tone="muted">
          {hint}
        </AppText>
      ) : null}
      <Sheet onClose={() => setOpen(false)} title={label} visible={open}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScroll}>
          <View style={styles.chipRow}>
            {years.map((year) => (
              <BouncePressable
                key={year}
                accessibilityRole="button"
                onPress={() => setView({ year, month: view.month })}
                pressScale={0.94}
                style={[styles.chip, year === view.year ? styles.chipActive : null]}
              >
                <AppText size="sm" weight={year === view.year ? "bold" : "regular"} tone={year === view.year ? "accent" : "text"}>
                  {year}年
                </AppText>
              </BouncePressable>
            ))}
          </View>
        </ScrollView>
        <View style={styles.monthNav}>
          <BouncePressable
            accessibilityRole="button"
            accessibilityLabel="前の月"
            onPress={() => setView(shiftMonth(view.year, view.month, -1))}
            pressScale={0.9}
            style={styles.navButton}
          >
            <AppText size="lg" tone="accent">‹</AppText>
          </BouncePressable>
          <AppText size="md" weight="bold">
            {view.year}年{view.month}月
          </AppText>
          <BouncePressable
            accessibilityRole="button"
            accessibilityLabel="次の月"
            onPress={() => setView(shiftMonth(view.year, view.month, 1))}
            pressScale={0.9}
            style={styles.navButton}
          >
            <AppText size="lg" tone="accent">›</AppText>
          </BouncePressable>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((weekday) => (
            <View key={weekday} style={styles.cell}>
              <AppText size="xs" tone="muted">
                {weekday}
              </AppText>
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((day, index) => (
            <View key={index} style={styles.cell}>
              {day === null ? null : (
                <BouncePressable
                  accessibilityRole="button"
                  onPress={() => pickDay(day)}
                  pressScale={0.88}
                  style={[
                    styles.dayButton,
                    selected?.year === view.year && selected?.month === view.month && selected?.day === day
                      ? styles.daySelected
                      : null,
                    today.year === view.year && today.month === view.month && today.day === day
                      ? styles.dayToday
                      : null,
                  ]}
                >
                  <AppText
                    size="sm"
                    weight={
                      selected?.year === view.year && selected?.month === view.month && selected?.day === day
                        ? "bold"
                        : "regular"
                    }
                    style={
                      selected?.year === view.year && selected?.month === view.month && selected?.day === day
                        ? styles.daySelectedText
                        : undefined
                    }
                  >
                    {day}
                  </AppText>
                </BouncePressable>
              )}
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <AppButton
            label="今日"
            variant="ghost"
            size="sm"
            onPress={() => {
              onChange(formatDateValue(today));
              setOpen(false);
            }}
          />
          {clearable ? (
            <AppButton
              label="クリア"
              variant="ghost"
              size="sm"
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  value: { flex: 1 },
  yearScroll: { flexGrow: 0 },
  chipRow: { flexDirection: "row", gap: space.xs },
  chip: {
    borderRadius: radius.pill,
    backgroundColor: colors.hover,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accentSoft },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.hover,
  },
  weekRow: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
  dayButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: { backgroundColor: colors.accent },
  daySelectedText: { color: colors.surface },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  footer: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
});
