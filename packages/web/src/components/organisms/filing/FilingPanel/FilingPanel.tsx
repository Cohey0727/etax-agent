import { BlueDeductionOptions, IncomeTaxResult, MiscIncomeInput, Transaction } from "@etax/shared";
import { Fragment } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { EtaxSubmitActions } from "@components/organisms/filing/EtaxSubmitActions";
import { FilingStatusKey, useFilingStatus } from "@components/organisms/filing/FilingStatusToggle";
import { IncomeSummary } from "@components/organisms/filing/IncomeSummary";
import { TaxSummary } from "@components/organisms/filing/TaxSummary";
import { AppView, FilingTab } from "@types";
import styles from "./FilingPanel.css";

/** 確定申告画面のタブのうち、総合から遷移できる先（総合自身を除くタブ）。 */
export type FilingSection = Exclude<FilingTab, "overview">;

const SECTION_OPEN_LABELS: Record<FilingSection, string> = {
  ledger: "帳簿タブを開く",
  deductions: "控除タブを開く",
  consumption: "消費税タブを開く",
  taxpayer: "納税者情報タブを開く",
};

interface ManualItem {
  key: FilingStatusKey;
  label: string;
  description: string;
  /** その項目の作業をするタブ。 */
  section: FilingSection;
}

/**
 * 手動で「確定」を付けられる項目。どれも独立していて、順番は問わない。
 * 各項目の行の直下に、その項目の結果の数字（帳簿→所得、控除・計算→税額）を
 * 並べ、見直してそのまま「確定」にできるようにする。
 * 提出はこのアプリでは行えない（e-Tax で本人が送信する）ため、確定を付ける
 * 項目には含めず、下に提出先への動線として別に置く。
 */
const MANUAL_ITEMS: readonly ManualItem[] = [
  {
    key: "confirmed",
    label: "帳簿",
    description: "帳簿の金額・科目・区分に誤りがないか見直したら確定します。見直しは帳簿タブで行います。",
    section: "ledger",
  },
  {
    key: "calculated",
    label: "控除・計算",
    description: "所得控除・税額控除を入力すると所得税額が自動計算されます。入力は控除タブで行います。",
    section: "deductions",
  },
];

export interface FilingPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 所得税の計算結果。「控除・計算」の行の下に税額の要約を表示するために使う。 */
  taxResult?: IncomeTaxResult;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得（その他）。所得の要約で合計に含める。 */
  miscIncome?: MiscIncomeInput;
  onNavigate?: (view: AppView) => void;
  /** 総合タブから各タブへ遷移する（確定申告画面内のタブ切替）。 */
  onOpenSection?: (section: FilingSection) => void;
}

/**
 * 確定申告の画面。各入力・手続きは独立していて、どの順番でも
 * 行ったり来たりできる（ステッパーは置かない）。
 * ステータスはダッシュボードの表示とサーバー保存を共有する。
 */
export const FilingPanel = ({
  transactions,
  year,
  taxResult,
  filingOptions,
  miscIncome,
  onNavigate,
  onOpenSection,
}: FilingPanelProps) => {
  const { status, loaded, available, savingKey, toggle } = useFilingStatus(year);

  return (
    <Col gap="lg">
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">{year}年分の確定申告</Text>
            <Text variant="muted">
              帳簿と控除・計算はそれぞれ独立した項目です。どの順番でも入力でき、
              いつでも行き来して直せます。確定した項目には印を付けておけます（ダッシュボードの
              申告ステータスと共有）。提出は e-Tax で行います。
            </Text>
          </Col>

          {MANUAL_ITEMS.map((item) => {
            const done = status[item.key];
            const doneAt = status[`${item.key}_at`];
            return (
              <Fragment key={item.key}>
                <div className={styles.statusRow}>
                  <Col gap="sm" className={styles.itemMain}>
                    <Text className={styles.itemLabel}>
                      {item.label}
                      <span className={done ? styles.stateDone : styles.stateTodo}>
                        {done ? `確定${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未確定"}
                      </span>
                    </Text>
                    <Text variant="muted">{item.description}</Text>
                  </Col>
                  <Row gap="sm" className={styles.itemActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!onOpenSection}
                      onClick={() => onOpenSection?.(item.section)}
                    >
                      {SECTION_OPEN_LABELS[item.section]}
                    </Button>
                    <Button
                      variant={done ? "ghost" : "primary"}
                      size="sm"
                      disabled={savingKey === item.key || !available}
                      onClick={() => void toggle(item.key)}
                    >
                      {done ? "確定解除" : "確定する"}
                    </Button>
                  </Row>
                </div>
                {item.key === "confirmed" ? (
                  <div className={styles.figuresBlock}>
                    <IncomeSummary transactions={transactions} year={year} filingOptions={filingOptions} miscIncome={miscIncome} />
                  </div>
                ) : null}
                {item.key === "calculated" && taxResult ? (
                  <div className={styles.figuresBlock}>
                    <TaxSummary taxResult={taxResult} />
                  </div>
                ) : null}
              </Fragment>
            );
          })}

          <div className={styles.statusRow}>
            <Col gap="sm" className={styles.itemMain}>
              <Text className={styles.itemLabel}>提出</Text>
              <Text variant="muted">
                e-Tax 用データ（XTX）を出力し、e-Tax に取り込んで送信します。出力は
                この画面の下の提出パネルで行います。提出後に内容の誤りに気づいた
                場合は、修正申告で訂正します。
              </Text>
            </Col>
            <Row gap="sm" className={styles.itemActions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!onNavigate}
                onClick={() => onNavigate?.(AppView.Amend)}
              >
                修正申告を開く →
              </Button>
            </Row>
          </div>
          <div className={styles.figuresBlock}>
            <EtaxSubmitActions />
          </div>

          <div className={styles.statusRow}>
            <Col gap="sm" className={styles.itemMain}>
              <Text className={styles.itemLabel}>消費税</Text>
              <Text variant="muted">
                消費税の申告書（3方式の比較とXTX出力）は、所得税とは別の提出物として
                消費税タブで用意します。
              </Text>
            </Col>
            <Row gap="sm" className={styles.itemActions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!onOpenSection}
                onClick={() => onOpenSection?.("consumption")}
              >
                {SECTION_OPEN_LABELS.consumption}
              </Button>
            </Row>
          </div>

          {loaded && !available ? (
            <Text variant="muted">
              ステータスを保存するサーバーに接続できていません。「確定する」は接続時に使えます。
            </Text>
          ) : null}
        </Col>
      </Card>
    </Col>
  );
};

function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "/");
}
