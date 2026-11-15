import { FilingType } from "@etax/shared";
import { Col, Row, Select, Text } from "@components/atoms";
import styles from "./FilingTypeFields.css";

export interface FilingTypeFieldsProps {
  filingType: FilingType;
  /** 不動産貸付けが事業的規模か（青色65万円・55万円のときだけ意味を持つ） */
  realEstateBusinessScale: boolean;
  onChange: (filingType: FilingType, realEstateBusinessScale: boolean) => void;
}

const FILING_TYPE_LABELS: Record<FilingType, string> = {
  blue65: "青色申告（65万円控除）",
  blue55: "青色申告（55万円控除）",
  blue10: "青色申告（10万円控除）",
  white: "白色申告（控除なし）",
};

const FILING_TYPE_NOTES: Partial<Record<FilingType, string>> = {
  blue10: "事業・不動産を合わせた所得の範囲内で、10万円まで控除します。",
  white: "白色申告では青色申告特別控除はありません。",
};

/**
 * 申告の種類（青色申告特別控除の区分）と不動産貸付けの規模の選択。
 * 納税者情報画面で管理する（保存先は確定申告・ダッシュボードと共有）。
 */
export const FilingTypeFields = ({
  filingType,
  realEstateBusinessScale,
  onChange,
}: FilingTypeFieldsProps) => {
  const showScale = filingType === "blue65" || filingType === "blue55";
  const note = FILING_TYPE_NOTES[filingType];
  return (
    <Col gap="sm">
      <Row gap="sm" align="center" wrap>
        <Text variant="muted" className={styles.label}>申告の種類</Text>
        <Select
          className={styles.select}
          value={filingType}
          onChange={(e) => onChange(e.target.value as FilingType, realEstateBusinessScale)}
          aria-label="申告の種類"
        >
          {(Object.keys(FILING_TYPE_LABELS) as FilingType[]).map((type) => (
            <option key={type} value={type}>
              {FILING_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Row>
      {showScale ? (
        <Row gap="sm" align="center" wrap>
          <Text variant="muted" className={styles.label}>不動産貸付けの規模</Text>
          <Select
            className={styles.select}
            value={realEstateBusinessScale ? "scale" : "non-scale"}
            onChange={(e) => onChange(filingType, e.target.value === "scale")}
            aria-label="不動産貸付けの規模"
          >
            <option value="non-scale">事業的規模でない（不動産分は10万円まで）</option>
            <option value="scale">事業的規模（不動産も事業と同じ上限）</option>
          </Select>
        </Row>
      ) : null}
      {note ? <Text variant="muted">{note}</Text> : null}
    </Col>
  );
};
