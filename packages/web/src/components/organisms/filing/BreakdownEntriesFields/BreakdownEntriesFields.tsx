import { ReactNode, useState } from "react";
import { Button, Col, Icon, Input, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import { BreakdownEntry } from "../DeductionPanel/deductionStorage";
import styles from "./BreakdownEntriesFields.css";

export interface BreakdownEntriesFieldsProps {
  /** 見出し（例: 社会保険料の内訳）。見出しごと開閉できる。 */
  title: string;
  /** 内訳（名称・金額） */
  entries: BreakdownEntry[];
  /**
   * 内訳が未入力のときに残っている合計（手入力時代の保存値）。
   * 内訳を編集し始めたら、合計は内訳の合計に置き換わる。
   */
  legacyTotal: number;
  onChange: (entries: BreakdownEntry[]) => void;
  /** 名称欄のプレースホルダ（例: 寄附先（自治体名など）） */
  namePlaceholder: string;
  /** 名称欄のラベル（例: 寄附先） */
  nameLabel: string;
  /** 追加ボタンの文言（例: ＋ 寄附を追加） */
  addLabel: string;
  /** 開いたときに合計の下に出す補足（控除の計算方法など） */
  note?: ReactNode;
}

let entryCounter = 0;

function newEntryId(): string {
  entryCounter += 1;
  return `breakdown-${Date.now().toString(36)}-${entryCounter}`;
}

/**
 * 「内訳があって合計が控除の元になる」入力の共通エディタ。
 * 寄附金・社会保険料・小規模企業共済等・医療費で使う。
 * 見出しは合計だけが見える開閉式（detail）で、開くと1件ずつ名称と金額を
 * 入れられる。合計は内訳の合計がそのまま控除の入力になる。
 * 入力済みの内訳がある場合は、隠れて見えないことがないよう開いた状態で始める。
 */
export const BreakdownEntriesFields = ({
  title,
  entries,
  legacyTotal,
  onChange,
  namePlaceholder,
  nameLabel,
  addLabel,
  note,
}: BreakdownEntriesFieldsProps) => {
  const [open, setOpen] = useState(() => entries.length > 0 || legacyTotal > 0);
  // 内訳がまだ無い場合は、保存済みの合計を1件として見せる（消えないように）。
  // 何も無ければ空の1行から始められるようにする。
  const rows: BreakdownEntry[] =
    entries.length > 0
      ? entries
      : legacyTotal > 0
        ? [{ id: "breakdown-legacy", recipient: "", amount: legacyTotal }]
        : [{ id: "breakdown-initial", recipient: "", amount: 0 }];
  const total = rows.reduce((sum, e) => sum + (e.amount || 0), 0);

  const update = (id: string, patch: Partial<BreakdownEntry>) =>
    onChange(rows.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(rows.filter((e) => e.id !== id));
  const add = () => onChange([...rows, { id: newEntryId(), recipient: "", amount: 0 }]);

  return (
    <Col gap="sm">
      <Row gap="sm" align="center" justify="spaceBetween">
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={open ? styles.chevronOpen : styles.chevron}>
            <Icon name="chevronDown" />
          </span>
          <Text>{title}</Text>
        </button>
        <Row gap="sm" align="center">
          <Text variant="muted">合計</Text>
          <Text>
            <strong>{formatYen(total)}</strong>
          </Text>
        </Row>
      </Row>
      {open ? (
        <Col gap="sm" className={styles.body}>
          {rows.map((entry) => (
            <Row key={entry.id} gap="sm" align="center">
              <Input
                className={styles.recipient}
                value={entry.recipient}
                onChange={(e) => update(entry.id, { recipient: e.target.value })}
                placeholder={namePlaceholder}
                aria-label={nameLabel}
              />
              <Input
                className={styles.amount}
                type="number"
                value={entry.amount}
                onChange={(e) => update(entry.id, { amount: toAmount(e.target.value) })}
                aria-label="金額"
              />
              <Button variant="ghost" size="sm" onClick={() => remove(entry.id)}>
                削除
              </Button>
            </Row>
          ))}
          <Row gap="sm" align="center">
            <Button variant="ghost" size="sm" onClick={add}>
              {addLabel}
            </Button>
          </Row>
          {note ? <Text variant="muted">{note}</Text> : null}
        </Col>
      ) : null}
    </Col>
  );
};

function toAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
