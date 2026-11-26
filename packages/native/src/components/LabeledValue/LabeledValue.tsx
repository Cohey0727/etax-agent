import { StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
};

const styles = StyleSheet.create({
  label: {
    color: "#6f6c8f",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  value: {
    color: "#26224d",
    fontSize: 15,
    fontWeight: "600",
  },
});

/** ラベルと値を左右に並べる表示行。 */
export function LabeledValue({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}
