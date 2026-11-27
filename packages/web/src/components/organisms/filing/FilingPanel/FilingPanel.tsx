import { FilingFigures, FilingSnapshotFigures, FilingType } from "@etax/shared";
import { ComponentType } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { ConfirmComparePanel } from "@components/organisms/filing/ConfirmComparePanel";
import {
  FilingStatusKey,
  FilingStatusToggle,
  UseFilingStatusResult,
} from "@components/organisms/filing/FilingStatusToggle";
import { IncomeSummary } from "@components/organisms/filing/IncomeSummary";
import { TaxSummary } from "@components/organisms/filing/TaxSummary";
import { FilingSnapshot, FilingTab } from "@types";
import styles from "./FilingPanel.css";

/**
 * 総合から遷移できる先。収支・控除・消費税は確定申告画面のタブ、
 * 納税者情報は独立画面（タブではないが、総合の項目としては並べる）。
 */
export type FilingSection = Exclude<FilingTab, "overview"> | "taxpayer";

/** 各項目の行の直下に出す、その項目の結果の数字が受け取る値。 */
interface FilingItemFiguresProps {
  figures: FilingFigures;
  filingType: FilingType;
  ledgerTransactionCount: number;
  calculated: boolean;
  snapshots: FilingSnapshot[] | null;
  currentFigures: FilingSnapshotFigures;
}

export interface FilingPanelProps {
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 帳簿と申告入力から求めた所得と税額 */
  figures: FilingFigures;
  /** 申告の種類 */
  filingType: FilingType;
  /** 対象年の帳簿の取引件数 */
  ledgerTransactionCount: number;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null。 */
  snapshots: FilingSnapshot[] | null;
  /** いまの計算結果（確定スナップショットと同じ形） */
  currentFigures: FilingSnapshotFigures;
  /** 確定申告画面が持つ申告ステータス。 */
  filingStatus: UseFilingStatusResult;
  /** 「確定する／確定解除」を押したとき（確定のときは計算結果を控える）。 */
  onToggleStatus: (key: FilingStatusKey) => void;
  /** 総合タブから各タブへ遷移する（確定申告画面内のタブ切替）。 */
  onOpenSection: (section: FilingSection) => void;
}

const SECTION_OPEN_LABELS: Record<FilingSection, string> = {
  balance: "収支タブを開く",
  deductions: "控除タブを開く",
  consumption: "消費税タブを開く",
  taxpayer: "納税者情報を開く",
};

/**
 * 手動で「確定」を付けられる項目。どれも独立していて、順番は問わない。
 * 各項目の行の直下に、その項目の結果の数字（収支→所得、控除・計算→税額と
 * 前回確定との差分）を並べ、見直してそのまま「確定」にできるようにする。
 * 提出はこのアプリでは行えない（e-Tax で本人が送信する）ため、確定を付ける
 * 項目には含めない。提出の動線（XTX出力と e-Tax へのリンク）は下の
 * TaxpayerPanel のカードにだけ置く（重複させない）。
 */
const MANUAL_ITEMS = [
  {
    key: "confirmed",
    label: "収支",
    description: "収支の金額・科目・区分に誤りがないか見直したら確定します。見直しは収支タブで行います。",
    section: "balance",
    Figures: IncomeItemFigures,
  },
  {
    key: "calculated",
    label: "控除・計算",
    description: "所得控除・税額控除を入力すると所得税額が自動計算されます。入力は控除タブで行います。確定するとその時点の計算結果が控えられ、確定解除して直してから再確定すると、前回確定との差分が下に出ます。",
    section: "deductions",
    Figures: CalculationItemFigures,
  },
] as const satisfies readonly {
  key: FilingStatusKey;
  label: string;
  description: string;
  section: FilingSection;
  Figures: ComponentType<FilingItemFiguresProps>;
}[];

/**
 * 確定申告の画面。各入力・手続きは独立していて、どの順番でも
 * 行ったり来たりできる（ステッパーは置かない）。
 * ステータスはダッシュボードの表示とサーバー保存を共有する。
 */
export const FilingPanel = ({
  year,
  filingStatus,
  onToggleStatus,
  onOpenSection,
  ...rest
}: FilingPanelProps) => {
  const figuresProps: FilingItemFiguresProps = {
    ...rest,
    calculated: filingStatus.status.calculated,
  };
  return (
    <Col gap="lg">
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">{year}年分の確定申告</Text>
            <Text variant="muted">
              収支と控除・計算はそれぞれ独立した項目です。どの順番でも入力でき、
              いつでも行き来して直せます。確定した項目には印を付けておけます（ダッシュボードの
              申告ステータスと共有）。提出は e-Tax で行います。
            </Text>
          </Col>

          {MANUAL_ITEMS.map(({ key, label, description, section, Figures }) => (
            <Col key={key} gap="md" className={styles.itemRow}>
              <FilingStatusToggle
                statusKey={key}
                label={label}
                description={description}
                filingStatus={filingStatus}
                onToggle={onToggleStatus}
              >
                <Button variant="ghost" size="sm" onClick={() => onOpenSection(section)}>
                  {SECTION_OPEN_LABELS[section]}
                </Button>
              </FilingStatusToggle>
              <div className={styles.figuresBlock}>
                <Figures {...figuresProps} />
              </div>
            </Col>
          ))}

          <Row gap="md" align="center" justify="spaceBetween" wrap className={styles.itemRow}>
            <Col gap="sm" className={styles.itemMain}>
              <Text className={styles.itemLabel}>消費税</Text>
              <Text variant="muted">
                消費税の申告書（3方式の比較とXTX出力）は、所得税とは別の提出物として
                消費税タブで用意します。
              </Text>
            </Col>
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("consumption")}>
              {SECTION_OPEN_LABELS.consumption}
            </Button>
          </Row>
        </Col>
      </Card>
    </Col>
  );
};

/** 「収支」の行の下: 収支と所得の要約。 */
function IncomeItemFigures({ figures, filingType, ledgerTransactionCount }: FilingItemFiguresProps) {
  return (
    <IncomeSummary
      figures={figures}
      filingType={filingType}
      ledgerTransactionCount={ledgerTransactionCount}
    />
  );
}

/** 「控除・計算」の行の下: 税額の要約と前回確定との差分。 */
function CalculationItemFigures({
  figures,
  calculated,
  snapshots,
  currentFigures,
}: FilingItemFiguresProps) {
  return (
    <Col gap="md">
      <TaxSummary taxResult={figures.taxResult} />
      <ConfirmComparePanel
        calculated={calculated}
        snapshots={snapshots}
        currentFigures={currentFigures}
      />
    </Col>
  );
}
