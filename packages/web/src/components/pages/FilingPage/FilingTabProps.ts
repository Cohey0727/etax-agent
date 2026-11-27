import { FilingFigures, FilingSnapshotFigures, Transaction } from "@etax/shared";
import {
  FilingSection,
  FilingStatusKey,
  UseDeductionStateResult,
  UseFilingStatusResult,
} from "@components/organisms/filing";
import { FilingSnapshot } from "@types";

/** 確定申告画面から帳簿画面を開くときの絞り込み（各タブの警告の種類）。 */
export type LedgerFilterKind = "mismatch" | "taxUnset" | "unclassified";

/** 確定申告画面の各タブが受け取る値。タブの表のコンポーネントはこの形にそろえる。 */
export interface FilingTabProps {
  year: number;
  /** 全年度の取引（基準期間など前の年も見るタブ用） */
  transactions: Transaction[];
  /** 対象年の取引（割り当て年度で絞り込み済み） */
  yearTransactions: Transaction[];
  /** 対象年の申告入力と、その書き換え */
  deduction: UseDeductionStateResult;
  /** 帳簿と申告入力から求めた所得と税額 */
  figures: FilingFigures;
  /** 前年の事業所得（青色申告特別控除前）。貸借対照表の繰越で元入金を求めるのに使う。 */
  previousIncomeBeforeBlue: number;
  filingStatus: UseFilingStatusResult;
  onToggleStatus: (key: FilingStatusKey) => void;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null。 */
  snapshots: FilingSnapshot[] | null;
  /** いまの計算結果（確定スナップショットと同じ形） */
  currentFigures: FilingSnapshotFigures;
  onOpenSection: (section: FilingSection) => void;
  onOpenLedger: (kind: LedgerFilterKind) => void;
}
