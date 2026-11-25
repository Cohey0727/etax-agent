import { useState } from "react";
import { Button, Col, Input, Row, Select } from "@components/atoms";
import { FixedAssetInput } from "@types";
import styles from "./FixedAssetPanel.css";
import { INCOME_TYPE_OPTIONS, METHOD_OPTIONS, USEFUL_LIFE_PRESETS } from "./fixedAssetOptions";

export interface FixedAssetFormProps {
  submitLabel: string;
  value: FixedAssetInput;
  busy: boolean;
  onChange: (input: FixedAssetInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** 固定資産の登録・編集フォーム（制御コンポーネント。状態は親が持ち、Drawer の中身として使う）。 */
export const FixedAssetForm = ({
  submitLabel,
  value,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: FixedAssetFormProps) => {
  const patch = (next: Partial<FixedAssetInput>) => onChange({ ...value, ...next });
  const dateOrNull = (raw: string): string | null => (raw ? raw : null);

  // 耐用年数は既定では候補セレクト。「選択肢にない」にチェックすると数値入力に切り替わる。
  // 初期値が候補にない年数（編集時）なら、最初から数値入力で開く。
  const [lifeCustom, setLifeCustom] = useState(
    () => !USEFUL_LIFE_PRESETS.includes(value.useful_life_years),
  );
  const [lastPreset, setLastPreset] = useState(() =>
    USEFUL_LIFE_PRESETS.includes(value.useful_life_years) ? value.useful_life_years : 5,
  );
  const toggleLifeCustom = (checked: boolean) => {
    setLifeCustom(checked);
    if (!checked && !USEFUL_LIFE_PRESETS.includes(value.useful_life_years)) {
      patch({ useful_life_years: lastPreset });
    }
  };

  return (
    <Col gap="md">
      <div className={styles.formGrid}>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-name">名称</label>
          <Input
            id="fa-name"
            type="text"
            value={value.name}
            placeholder="例: MacBook Pro 14インチ"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-quantity">数量</label>
          <Input
            id="fa-quantity"
            type="text"
            value={value.quantity}
            placeholder="例: 1台"
            onChange={(e) => patch({ quantity: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-income-type">所得区分</label>
          <Select
            id="fa-income-type"
            value={value.income_type}
            onChange={(e) => patch({ income_type: e.target.value })}
          >
            {INCOME_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-acquisition">取得日</label>
          <Input
            id="fa-acquisition"
            type="date"
            value={value.acquisition_date}
            onChange={(e) => patch({ acquisition_date: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-service-start">事業供用日（空欄なら取得日）</label>
          <Input
            id="fa-service-start"
            type="date"
            value={value.service_start_date ?? ""}
            onChange={(e) => patch({ service_start_date: dateOrNull(e.target.value) })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-cost">取得価額（円）</label>
          <Input
            id="fa-cost"
            type="number"
            min={1}
            step={1}
            value={value.cost === 0 ? "" : value.cost}
            placeholder="例: 446400"
            onChange={(e) => patch({ cost: e.target.value === "" ? 0 : Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-life">耐用年数（年）</label>
          <Row gap="sm" align="center">
            {lifeCustom ? (
              <Input
                id="fa-life"
                className={styles.lifeInput}
                type="number"
                min={1}
                step={1}
                value={value.useful_life_years}
                onChange={(e) => patch({ useful_life_years: Number(e.target.value) })}
              />
            ) : (
              <Select
                id="fa-life"
                className={styles.lifeInput}
                value={
                  USEFUL_LIFE_PRESETS.includes(value.useful_life_years)
                    ? value.useful_life_years
                    : lastPreset
                }
                onChange={(e) => {
                  const years = Number(e.target.value);
                  setLastPreset(years);
                  patch({ useful_life_years: years });
                }}
              >
                {USEFUL_LIFE_PRESETS.map((years) => (
                  <option key={years} value={years}>
                    {years}年
                  </option>
                ))}
              </Select>
            )}
            <label className={styles.lifeCustomToggle}>
              <input
                type="checkbox"
                checked={lifeCustom}
                onChange={(e) => toggleLifeCustom(e.target.checked)}
              />
              選択肢にない
            </label>
          </Row>
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-method">償却方法</label>
          <Select
            id="fa-method"
            value={value.method}
            onChange={(e) => patch({ method: e.target.value as FixedAssetInput["method"] })}
          >
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-ratio">事業専用割合（%）</label>
          <Input
            id="fa-ratio"
            type="number"
            min={0}
            max={100}
            step={1}
            value={value.business_ratio_percent}
            onChange={(e) => patch({ business_ratio_percent: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="fa-disposed">除却日（除却した場合のみ）</label>
          <Input
            id="fa-disposed"
            type="date"
            value={value.disposed_date ?? ""}
            onChange={(e) => patch({ disposed_date: dateOrNull(e.target.value) })}
          />
        </div>
      </div>
      <Row gap="sm" justify="end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button onClick={onSubmit} disabled={busy} disabledReason="保存中です">
          {submitLabel}
        </Button>
      </Row>
    </Col>
  );
};
