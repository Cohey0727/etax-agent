import { StyleSheet } from "react-native";
import { colors, space } from "@/theme";

/** 試算表・資金繰りの表組みで共有するスタイル（ラベル列＋金額列）。 */
export const tableStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  headRow: { borderBottomColor: colors.borderStrong },
  subtotalRow: { backgroundColor: colors.hover },
  totalRow: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.borderStrong },
  label: { flex: 1, minWidth: 120 },
});
