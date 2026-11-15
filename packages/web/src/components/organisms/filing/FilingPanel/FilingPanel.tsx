import { IncomeTaxResult, Transaction } from "@etax/shared";
import { Fragment } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
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
  /** その項目の作業をするタブ。提出だけは総合タブ内で完結するので無し。 */
  section?: FilingSection;
}

/**
 * 手動で「済み」を付けられる項目。どれも独立していて、順番は問わない。
 * 各項目の行の直下に、その項目の結果の数字（帳簿→所得、控除・計算→税額）を
 * 並べ、見直してそのまま「済み」にできるようにする。
 */
const MANUAL_ITEMS: readonly ManualItem[] = [
  {
    key: "confirmed",
    label: "帳簿",
    description: "帳簿の金額・科目・区分に誤りがないか見直したら「済み」にします。見直しは帳簿タブで行います。",
    section: "ledger",
  },
  {
    key: "calculated",
    label: "控除・計算",
    description: "所得控除・税額控除を入力すると所得税額が自動計算されます。入力は控除タブで行います。",
    section: "deductions",
  },
  {
    key: "submitted",
    label: "提出",
    description: "e-Tax 用データ（XTX）を出力し、e-Tax ソフト／WEB版に取り込んで送信します。出力はこのタブの下のパネルで行います。送信はマイナンバーカードで本人が行う操作です。",
  },
];

export interface FilingPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 所得税の計算結果。「控除・計算」の行の下に税額の要約を表示するために使う。 */
  taxResult?: IncomeTaxResult;
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
  onNavigate,
  onOpenSection,
}: FilingPanelProps) => {
  const { status, loaded, available, savingKey, toggle } = useFilingStatus(year);
  const allSubmitted = status.submitted;

  return (
    <Col gap="lg">
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">{year}年分の確定申告</Text>
            <Text variant="muted">
              帳簿・確認・控除・提出はそれぞれ独立した項目です。どの順番でも入力でき、
              いつでも行き来して直せます。済んだ項目には印を付けておけます（ダッシュボードの
              申告ステータスと共有）。
            </Text>
            {allSubmitted ? (
              <Col gap="sm">
                <Text>この年の申告は提出済みになっています。</Text>
                <Text variant="muted">
                  提出後に内容の誤りに気づいた場合は、修正申告で訂正します。
                </Text>
                <Row>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!onNavigate}
                    onClick={() => onNavigate?.(AppView.Amend)}
                  >
                    修正申告を開く →
                  </Button>
                </Row>
              </Col>
            ) : null}
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
                        {done ? `済み${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未"}
                      </span>
                    </Text>
                    <Text variant="muted">{item.description}</Text>
                  </Col>
                  <Row gap="sm" className={styles.itemActions}>
                    {item.section ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!onOpenSection}
                        onClick={() => item.section && onOpenSection?.(item.section)}
                      >
                        {SECTION_OPEN_LABELS[item.section]}
                      </Button>
                    ) : null}
                    <Button
                      variant={done ? "ghost" : "primary"}
                      size="sm"
                      disabled={savingKey === item.key || !available}
                      onClick={() => void toggle(item.key)}
                    >
                      {done ? "戻す" : "済みにする"}
                    </Button>
                  </Row>
                </div>
                {item.key === "confirmed" ? (
                  <div className={styles.figuresBlock}>
                    <IncomeSummary transactions={transactions} year={year} />
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
              ステータスを保存するサーバーに接続できていません。「済みにする」は接続時に使えます。
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
