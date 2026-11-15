import {
  CasualtyLossInput,
  DeductionInputs,
  EarthquakeInsurancePremiums,
  FilingType,
  IncomeDeductionBreakdown,
  LifeInsurancePremiums,
  SpouseCategory,
} from "@etax/shared";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import { formatNumber } from "@utils";
import { BreakdownEntriesFields } from "../BreakdownEntriesFields";
import { FilingTypeFields } from "../FilingTypeFields";
import { BreakdownEntriesKey, BreakdownEntry } from "./deductionStorage";
import styles from "./DeductionPanel.css";

/** 所得控除の内訳表示ラベル（エンジンの内訳キー → 正式名称）。 */
const DEDUCTION_LABELS: readonly { key: keyof IncomeDeductionBreakdown; label: string }[] = [
  { key: "casualtyLoss", label: "雑損控除" },
  { key: "medical", label: "医療費控除" },
  { key: "socialInsurance", label: "社会保険料控除" },
  { key: "smallBusinessMutualAid", label: "小規模企業共済等掛金控除" },
  { key: "lifeInsurance", label: "生命保険料控除" },
  { key: "earthquakeInsurance", label: "地震保険料控除" },
  { key: "donations", label: "寄附金控除" },
  { key: "disability", label: "障害者控除" },
  { key: "widow", label: "寡婦控除" },
  { key: "singleParent", label: "ひとり親控除" },
  { key: "workingStudent", label: "勤労学生控除" },
  { key: "spouse", label: "配偶者控除" },
  { key: "spouseSpecial", label: "配偶者特別控除" },
  { key: "dependents", label: "扶養控除" },
  { key: "specialRelative", label: "特定親族特別控除" },
  { key: "basic", label: "基礎控除" },
];

export interface DeductionPanelProps {
  year: number;
  deductions: DeductionInputs;
  /** 所得控除の内訳（自動計算済み） */
  breakdown: IncomeDeductionBreakdown;
  onChange: (next: DeductionInputs) => void;
  /** 申告の種類（青色申告特別控除の区分） */
  filingType: FilingType;
  /** 不動産貸付けが事業的規模か */
  realEstateBusinessScale: boolean;
  onFilingSettingsChange: (filingType: FilingType, realEstateBusinessScale: boolean) => void;
  /** 内訳を持つ控除入力（寄附金・社会保険料・小規模企業共済等・医療費） */
  breakdownEntries: Record<BreakdownEntriesKey, BreakdownEntry[]>;
  onBreakdownEntriesChange: (key: BreakdownEntriesKey, entries: BreakdownEntry[]) => void;
}

export const DeductionPanel = ({
  year,
  deductions,
  breakdown,
  onChange,
  filingType,
  realEstateBusinessScale,
  onFilingSettingsChange,
  breakdownEntries,
  onBreakdownEntriesChange,
}: DeductionPanelProps) => {
  const set = (patch: Partial<DeductionInputs>) => onChange({ ...deductions, ...patch });
  const setLife = (patch: Partial<LifeInsurancePremiums>) =>
    set({ lifeInsurance: { ...deductions.lifeInsurance, ...patch } });
  const setEarthquake = (patch: Partial<EarthquakeInsurancePremiums>) =>
    set({ earthquakeInsurance: { ...deductions.earthquakeInsurance, ...patch } });
  const casualty: CasualtyLossInput = deductions.casualtyLoss ?? {
    damageAmount: 0,
    disasterRelatedExpenses: 0,
    otherRelatedExpenses: 0,
    compensation: 0,
  };
  const setCasualty = (patch: Partial<CasualtyLossInput>) =>
    set({ casualtyLoss: { ...casualty, ...patch } });

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">申告の種類</Text>
          <FilingTypeFields
            filingType={filingType}
            realEstateBusinessScale={realEstateBusinessScale}
            onChange={onFilingSettingsChange}
          />
        </Col>

        <Col gap="sm">
          <Text variant="sectionTitle">所得控除の入力</Text>
          <Text variant="muted">
            支払った金額や家族の状況を入れると、所得控除が自動計算されて上の差分表の
            所得税額（修正後）に反映されます。基礎控除は所得金額から自動で決まります。
            入力はこの端末に保存されます。
          </Text>
        </Col>

        <Text className={styles.subhead}>支払った金額</Text>
        <Col gap="sm">
          <BreakdownEntriesFields
            title="社会保険料の内訳"
            entries={breakdownEntries.socialInsurance}
            legacyTotal={deductions.socialInsurancePaid}
            onChange={(entries) => onBreakdownEntriesChange("socialInsurance", entries)}
            namePlaceholder="国民年金・国民健康保険など"
            nameLabel="社会保険料の名称"
            addLabel="＋ 保険料を追加"
          />
        </Col>
        <Col gap="sm">
          <BreakdownEntriesFields
            title="小規模企業共済・iDeCo等の内訳"
            entries={breakdownEntries.mutualAid}
            legacyTotal={deductions.smallBusinessMutualAidPaid}
            onChange={(entries) => onBreakdownEntriesChange("mutualAid", entries)}
            namePlaceholder="小規模企業共済・iDeCoなど"
            nameLabel="掛金の名称"
            addLabel="＋ 掛金を追加"
          />
        </Col>
        <Col gap="sm">
          <BreakdownEntriesFields
            title="医療費の内訳"
            entries={breakdownEntries.medical}
            legacyTotal={deductions.medicalExpensesPaid}
            onChange={(entries) => onBreakdownEntriesChange("medical", entries)}
            namePlaceholder="医療機関名など"
            nameLabel="医療費の支払先"
            addLabel="＋ 医療費を追加"
          />
        </Col>
        <AmountField
          label="医療費の補填金（保険金など）"
          value={deductions.medicalReimbursement}
          onChange={(v) => set({ medicalReimbursement: v })}
        />
        <Col gap="sm">
          <BreakdownEntriesFields
            title="寄附金の内訳（ふるさと納税を含む）"
            entries={breakdownEntries.donations}
            legacyTotal={deductions.donationsTotal}
            onChange={(entries) => onBreakdownEntriesChange("donations", entries)}
            namePlaceholder="寄附先（自治体名など）"
            nameLabel="寄附先"
            addLabel="＋ 寄附を追加"
            note="寄附金控除は、合計から2,000円を差し引いた額です（所得金額の40%が上限）。ふるさと納税もここに含めてください。"
          />
        </Col>

        <Text className={styles.subhead}>保険料</Text>
        <AmountField
          label="生命保険料（新契約・一般）"
          value={deductions.lifeInsurance.newGeneral}
          onChange={(v) => setLife({ newGeneral: v })}
        />
        <AmountField
          label="生命保険料（新契約・介護医療）"
          value={deductions.lifeInsurance.newCareMedical}
          onChange={(v) => setLife({ newCareMedical: v })}
        />
        <AmountField
          label="生命保険料（新契約・個人年金）"
          value={deductions.lifeInsurance.newPension}
          onChange={(v) => setLife({ newPension: v })}
        />
        <AmountField
          label="生命保険料（旧契約・一般）"
          value={deductions.lifeInsurance.oldGeneral}
          onChange={(v) => setLife({ oldGeneral: v })}
        />
        <AmountField
          label="生命保険料（旧契約・個人年金）"
          value={deductions.lifeInsurance.oldPension}
          onChange={(v) => setLife({ oldPension: v })}
        />
        <AmountField
          label="地震保険料（地震部分）"
          value={deductions.earthquakeInsurance.earthquake}
          onChange={(v) => setEarthquake({ earthquake: v })}
        />
        <AmountField
          label="旧長期損害保険料"
          value={deductions.earthquakeInsurance.oldLongTerm}
          onChange={(v) => setEarthquake({ oldLongTerm: v })}
        />

        <Text className={styles.subhead}>雑損控除（災害・盗難などの損失）</Text>
        <AmountField
          label="損害金額"
          value={casualty.damageAmount}
          onChange={(v) => setCasualty({ damageAmount: v })}
        />
        <AmountField
          label="災害関連支出（取壊し・除去費用など）"
          value={casualty.disasterRelatedExpenses}
          onChange={(v) => setCasualty({ disasterRelatedExpenses: v })}
        />
        <AmountField
          label="その他の関連支出（原状回復費など）"
          value={casualty.otherRelatedExpenses}
          onChange={(v) => setCasualty({ otherRelatedExpenses: v })}
        />
        <AmountField
          label="補填金（保険金・損害賠償金など）"
          value={casualty.compensation}
          onChange={(v) => setCasualty({ compensation: v })}
        />

        <Text className={styles.subhead}>家族・人的控除</Text>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">配偶者控除</Text>
          </div>
          <Select
            className={styles.fieldSelect}
            value={deductions.spouseCategory}
            onChange={(e) => set({ spouseCategory: e.target.value as SpouseCategory })}
            aria-label="配偶者控除の区分"
          >
            <option value="none">なし</option>
            <option value="general">一般の配偶者</option>
            <option value="elderly">老人控除対象配偶者</option>
          </Select>
        </Row>
        <NullableAmountField
          label="配偶者の合計所得金額（配偶者特別控除用）"
          value={deductions.spouseTotalIncome}
          onChange={(v) => set({ spouseTotalIncome: v })}
        />
        <AmountField
          label="扶養親族（一般）"
          suffix="人"
          value={deductions.dependents.general}
          onChange={(v) => set({ dependents: { ...deductions.dependents, general: v } })}
        />
        <AmountField
          label="扶養親族（特定・19〜22歳）"
          suffix="人"
          value={deductions.dependents.specific}
          onChange={(v) => set({ dependents: { ...deductions.dependents, specific: v } })}
        />
        <AmountField
          label="扶養親族（老人・70歳以上）"
          suffix="人"
          value={deductions.dependents.elderly}
          onChange={(v) => set({ dependents: { ...deductions.dependents, elderly: v } })}
        />
        <AmountField
          label="扶養親族（同居老親等）"
          suffix="人"
          value={deductions.dependents.elderlyCohabiting}
          onChange={(v) =>
            set({ dependents: { ...deductions.dependents, elderlyCohabiting: v } })
          }
        />
        <AmountField
          label="障害者"
          suffix="人"
          value={deductions.disability.general}
          onChange={(v) => set({ disability: { ...deductions.disability, general: v } })}
        />
        <AmountField
          label="特別障害者"
          suffix="人"
          value={deductions.disability.special}
          onChange={(v) => set({ disability: { ...deductions.disability, special: v } })}
        />
        <AmountField
          label="同居特別障害者"
          suffix="人"
          value={deductions.disability.specialCohabiting}
          onChange={(v) =>
            set({ disability: { ...deductions.disability, specialCohabiting: v } })
          }
        />
        <Row gap="sm">
          <ToggleButton
            label="寡婦控除"
            active={deductions.isWidow}
            onClick={() => set({ isWidow: !deductions.isWidow, isSingleParent: false })}
          />
          <ToggleButton
            label="ひとり親控除"
            active={deductions.isSingleParent}
            onClick={() => set({ isSingleParent: !deductions.isSingleParent, isWidow: false })}
          />
          <ToggleButton
            label="勤労学生控除"
            active={deductions.isWorkingStudent}
            onClick={() => set({ isWorkingStudent: !deductions.isWorkingStudent })}
          />
        </Row>
        {year === 2025 && (
          <NullableAmountField
            label="特定親族（19〜22歳）の合計所得金額"
            value={deductions.specialRelativeTotalIncome}
            onChange={(v) => set({ specialRelativeTotalIncome: v })}
          />
        )}

        <Text className={styles.subhead}>所得控除の内訳（自動計算）</Text>
        <Col gap="sm">
          {DEDUCTION_LABELS.filter(({ key }) => breakdown[key] > 0).map(({ key, label }) => (
            <Row key={key} gap="sm" justify="spaceBetween">
              <Text variant="muted">{label}</Text>
              <Text>{formatNumber(breakdown[key])}円</Text>
            </Row>
          ))}
          <Row gap="sm" justify="spaceBetween">
            <Text>所得控除の合計</Text>
            <Text variant="statValue">{formatNumber(breakdown.total)}円</Text>
          </Row>
        </Col>
      </Col>
    </Card>
  );
};

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** 単位表示（人数は「人」）。金額は表示しない（円は内訳側で付ける）。 */
  suffix?: string;
}

const AmountField = ({ label, value, onChange, suffix }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">
        {label}
        {suffix ? `（${suffix}）` : ""}
      </Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

interface NullableAmountFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

const NullableAmountField = ({ label, value, onChange }: NullableAmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value ?? ""}
      placeholder="対象がいなければ空欄"
      onChange={(e) => onChange(e.target.value === "" ? null : toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const ToggleButton = ({ label, active, onClick }: ToggleButtonProps) => (
  <Button variant={active ? "tabActive" : "tab"} size="sm" onClick={onClick}>
    {label}
    {active ? " ✓" : ""}
  </Button>
);

function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
