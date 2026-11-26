import { BalanceSheetWireExtra } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Field } from "@/components";
import { space } from "@/theme";
import { MoneyInput } from "../fields";

/**
 * BalanceSheetRows.tsx — 貸借対照表の入力行部品
 * （科目行・期末のみの行・自由追加行）。
 */

export interface AccountRowProps {
  label: string;
  opening: number;
  closing: number;
  onOpening: (value: number) => void;
  onClosing: (value: number) => void;
}

/** 科目1行（期首・期末の金額入力）。 */
export function AccountRow({ label, opening, closing, onOpening, onClosing }: AccountRowProps) {
  return (
    <View style={styles.accountRow}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {label}
      </AppText>
      <View style={styles.amountPair}>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期首（1月1日）
          </AppText>
          <MoneyInput accessibilityLabel={`${label}（期首）`} value={opening} onChange={onOpening} />
        </View>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期末（12月31日）
          </AppText>
          <MoneyInput accessibilityLabel={`${label}（期末）`} value={closing} onChange={onClosing} />
        </View>
      </View>
    </View>
  );
}

export interface ClosingOnlyRowProps {
  label: string;
  closing: number;
  onClosing: (value: number) => void;
}

/** 期末だけの科目1行（事業主貸・事業主借）。 */
export function ClosingOnlyRow({ label, closing, onClosing }: ClosingOnlyRowProps) {
  return (
    <View style={styles.accountRow}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {label}
      </AppText>
      <View style={styles.amountPair}>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期首（1月1日）
          </AppText>
          <AppText size="md" style={styles.readonlyAmount}>
            ―
          </AppText>
        </View>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期末（12月31日）
          </AppText>
          <MoneyInput accessibilityLabel={`${label}（期末）`} value={closing} onChange={onClosing} />
        </View>
      </View>
    </View>
  );
}

export interface ExtraRowProps {
  nameLabel: string;
  value: BalanceSheetWireExtra;
  onChange: (next: BalanceSheetWireExtra) => void;
}

/** 自由追加の科目1行（科目名＋期首・期末の金額入力）。 */
export function ExtraRow({ nameLabel, value, onChange }: ExtraRowProps) {
  return (
    <View style={styles.accountRow}>
      <Field
        label={nameLabel}
        value={value.name}
        onChangeText={(name) => onChange({ ...value, name })}
        placeholder={nameLabel}
      />
      <View style={styles.amountPair}>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期首（1月1日）
          </AppText>
          <MoneyInput
            accessibilityLabel={`${nameLabel}（期首）`}
            value={value.opening}
            onChange={(opening) => onChange({ ...value, opening })}
          />
        </View>
        <View style={styles.amountCell}>
          <AppText size="xs" tone="muted">
            期末（12月31日）
          </AppText>
          <MoneyInput
            accessibilityLabel={`${nameLabel}（期末）`}
            value={value.closing}
            onChange={(closing) => onChange({ ...value, closing })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountRow: { gap: 4 },
  amountPair: { flexDirection: "row", gap: space.sm },
  amountCell: { flex: 1, gap: 2 },
  readonlyAmount: { textAlign: "right", paddingVertical: 10, paddingHorizontal: 10 },
});
