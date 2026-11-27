/**
 * businessStartFields.tsx — 開業届・青色申告承認申請書パネルの入力部品。
 * ラベル列つきのテキスト・日付・選択・チェック欄と、期限表示の行。
 */
import { Col, Input, Row, Select, Text } from "@components/atoms";
import { SalarySituationRow } from "@types";
import styles from "./BusinessStartPanel.css";

/** 有・無・未選択の選択肢の値 → 様式の「有無」欄の値。 */
const NULLABLE_BOOL_BY_OPTION: Readonly<Record<string, boolean | null>> = {
  "": null,
  yes: true,
  no: false,
};

/** YYYY-MM-DD を「YYYY年M月D日」へ整形する。 */
export function formatJapaneseDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

interface DeadlineRowProps {
  name: string;
  deadline: { date: string; rule: string };
}

export const DeadlineRow = ({ name, deadline }: DeadlineRowProps) => (
  <Row gap="sm" wrap>
    <div className={styles.fieldLabel}>
      <Text variant="muted">{name}</Text>
    </div>
    <Text>
      {formatJapaneseDate(deadline.date)}まで（{deadline.rule}）
    </Text>
  </Row>
);

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

export const TextField = ({ label, value, onChange, placeholder, type = "text" }: TextFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  </Row>
);

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

export const SelectField = ({ label, value, options, onChange }: SelectFieldProps) => (
  <Row gap="sm" align="center">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Select
      className={styles.fieldInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  </Row>
);

interface NullableBoolFieldProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}

/** 有・無・未選択の3値選択（様式の「有無」欄用）。 */
export const NullableBoolField = ({ label, value, onChange }: NullableBoolFieldProps) => (
  <SelectField
    label={label}
    value={optionOfNullableBool(value)}
    options={[
      { value: "", label: "未選択" },
      { value: "yes", label: "有" },
      { value: "no", label: "無" },
    ]}
    onChange={(v) => onChange(NULLABLE_BOOL_BY_OPTION[v] ?? null)}
  />
);

interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** ラベルを左列に置く（単独行のチェック用）。 */
  wide?: boolean;
}

export const CheckRow = ({ label, checked, onChange, wide }: CheckRowProps) => (
  <Row gap="sm" align="center">
    {wide ? (
      <div className={styles.fieldLabel}>
        <Text variant="muted">{label}</Text>
      </div>
    ) : null}
    <label>
      <Row gap="sm" align="center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        {wide ? null : <Text variant="muted">{label}</Text>}
      </Row>
    </label>
  </Row>
);

interface SalaryRowFieldsProps {
  label: string;
  row: SalarySituationRow;
  onChange: (row: SalarySituationRow) => void;
}

/** 給与等の支払の状況の1行（人数・給与の定め方・税額の有無）。 */
export const SalaryRowFields = ({ label, row, onChange }: SalaryRowFieldsProps) => (
  <Row gap="sm" align="center" wrap>
    <div className={styles.fieldLabel}>
      <Text variant="muted">給与等の支払（{label}）</Text>
    </div>
    <Input
      className={styles.fieldInputNarrow}
      type="number"
      value={row.count === null ? "" : String(row.count)}
      placeholder="人数"
      onChange={(e) =>
        onChange({ ...row, count: e.target.value === "" ? null : Number(e.target.value) || 0 })
      }
      aria-label={`${label}の従事員数`}
    />
    <Input
      className={styles.fieldInput}
      type="text"
      value={row.terms}
      placeholder="給与の定め方（月給など）"
      onChange={(e) => onChange({ ...row, terms: e.target.value })}
      aria-label={`${label}の給与の定め方`}
    />
    <Select
      value={optionOfNullableBool(row.has_tax)}
      onChange={(e) =>
        onChange({ ...row, has_tax: NULLABLE_BOOL_BY_OPTION[e.target.value] ?? null })
      }
      aria-label={`${label}の税額の有無`}
    >
      <option value="">税額の有無</option>
      <option value="yes">有</option>
      <option value="no">無</option>
    </Select>
  </Row>
);

/** 提出のしかた（e-Tax 等での提出導線と、受信通知の保管の案内）。 */
export const SubmissionGuide = () => (
  <Col gap="sm">
    <Text variant="sectionTitle">提出のしかた</Text>
    <Text variant="muted">
      提出は e-Tax ソフト（WEB版）またはマイナポータルのワンストップサービスで、
      この PDF と同じ内容を入力して送信します（この PDF は紙で提出する場合と、
      送信前の記入内容の確認用です）。紙の場合は、住所地を所轄する税務署へ
      持参または郵送してください。
    </Text>
    <Text variant="muted">
      2025年1月から、税務署が控えに収受日付印を押す取扱いは廃止されています。
      提出の証跡は e-Tax の受信通知（PDF）です。受信通知は印刷した届出書と
      一緒に必ず保管してください。
    </Text>
  </Col>
);

/** 様式の「有無」欄の値 → 選択肢の値。 */
function optionOfNullableBool(value: boolean | null): string {
  if (value === null) return "";
  return value ? "yes" : "no";
}
