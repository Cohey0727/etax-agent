import { ACCOUNT_NAMES, Transaction } from "@etax/shared";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Input,
  LoadingCircle,
  Row,
  Select,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { LedgerTransaction, LedgerTransactionInput } from "@types";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  recordClassificationFeedback,
  updateLedgerTransaction,
} from "@utils/api";
import { formatYen } from "@utils/format";
import styles from "./LedgerPanel.css";

export interface LedgerPanelProps {
  /** アプリ全体で保持している取引（他年分とのマージ用）。 */
  transactions: Transaction[];
  year: number;
  /** 帳簿の変更をアプリ全体の取引へ反映する（メモリのみ・遷移なし）。 */
  onSyncTransactions?: (transactions: Transaction[]) => void;
}

type LoadStatus = "loading" | "ready" | "unavailable";

const INCOME_TYPE_OPTIONS = [
  { value: "business", label: "事業" },
  { value: "real_estate", label: "不動産" },
  { value: "other", label: "対象外" },
] as const;

const CATEGORY_OPTIONS: readonly string[] = ["未分類", ...ACCOUNT_NAMES];

const toInput = (row: LedgerTransaction): LedgerTransactionInput => ({
  date: row.date,
  description: row.description,
  amount: row.amount,
  account: row.account,
  category: row.category,
  income_type: row.income_type,
});

const emptyDraft = (year: number): LedgerTransactionInput => ({
  date: `${year}-01-01`,
  description: "",
  amount: 0,
  account: "手入力",
  category: "未分類",
  income_type: "business",
});

export const LedgerPanel = ({ transactions, year, onSyncTransactions }: LedgerPanelProps) => {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [rows, setRows] = useState<LedgerTransaction[]>([]);
  const [edits, setEdits] = useState<Record<number, LedgerTransactionInput>>({});
  const [draft, setDraft] = useState<LedgerTransactionInput>(() => emptyDraft(year));
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const syncParent = (freshRows: LedgerTransaction[]) => {
    if (!onSyncTransactions) return;
    const others = transactions.filter((tx) => tx.year !== year);
    const merged = [...others, ...freshRows.map(ledgerRowToTransaction)].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    onSyncTransactions(merged);
  };

  const applyRows = (freshRows: LedgerTransaction[]) => {
    setRows(freshRows);
    setEdits(Object.fromEntries(freshRows.map((row) => [row.id, toInput(row)])));
    setDeleteArmedId(null);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setDraft(emptyDraft(year));
    void (async () => {
      const fetched = await fetchLedgerTransactions(year);
      if (cancelled) return;
      if (!fetched) {
        setStatus("unavailable");
        return;
      }
      applyRows(fetched);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // 年が変わったら帳簿を読み直す（transactions の変化では読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const handleEdit = (id: number, patch: Partial<LedgerTransactionInput>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const isDirty = (row: LedgerTransaction): boolean => {
    const edit = edits[row.id];
    if (!edit) return false;
    const original = toInput(row);
    return (
      edit.date !== original.date ||
      edit.description !== original.description ||
      edit.amount !== original.amount ||
      edit.account !== original.account ||
      edit.category !== original.category ||
      edit.income_type !== original.income_type
    );
  };

  const handleSave = async (row: LedgerTransaction) => {
    const edit = edits[row.id];
    if (!edit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLedgerTransaction(row.id, edit);
      const fresh = rows.map((r) => (r.id === row.id ? updated : r));
      applyRows(fresh);
      syncParent(fresh);
      // 科目を直したら学習履歴にも記録し、次回から同じ摘要は直した科目で判定されるようにする。
      if (updated.category !== row.category && updated.category !== "未分類") {
        void recordClassificationFeedback(updated.description, updated.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: LedgerTransaction) => {
    if (deleteArmedId !== row.id) {
      setDeleteArmedId(row.id);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLedgerTransaction(row.id);
      const fresh = rows.filter((r) => r.id !== row.id);
      applyRows(fresh);
      syncParent(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (busy) return;
    if (!draft.date.startsWith(`${year}-`)) {
      setError(`日付は ${year} 年の日付にしてください`);
      return;
    }
    if (!draft.description.trim()) {
      setError("摘要を入力してください");
      return;
    }
    if (draft.amount === 0) {
      setError("金額を入力してください（支出はマイナス）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createLedgerTransaction(draft);
      const fresh = [...rows, created].sort((a, b) => a.date.localeCompare(b.date));
      applyRows(fresh);
      syncParent(fresh);
      setDraft(emptyDraft(year));
      // 手入力で科目を選んだ行も学習履歴に記録する（次回の判定で優先される）。
      if (created.category !== "未分類") {
        void recordClassificationFeedback(created.description, created.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <Card>
        <Row gap="sm" align="center">
          <LoadingCircle />
          <Text variant="body">帳簿を読み込んでいます…</Text>
        </Row>
      </Card>
    );
  }

  if (status === "unavailable") {
    return (
      <AlertBox variant="notice">
        帳簿データベースに接続できません。サーバーの DATABASE_URL が未設定か、データベースが
        起動していません。接続されると、この画面で取引の保存・編集ができるようになります。
      </AlertBox>
    );
  }

  const incomeTotal = rows.reduce((sum, row) => (row.amount > 0 ? sum + row.amount : sum), 0);
  const expenseTotal = rows.reduce((sum, row) => (row.amount < 0 ? sum - row.amount : sum), 0);

  return (
    <Col gap="lg">
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}
      <Card>
        <Col gap="md">
          <Row gap="md" align="center" justify="spaceBetween">
            <Text variant="sectionTitle">{year}年の帳簿</Text>
            <Text variant="body">
              {rows.length}件 ・ 収入 {formatYen(incomeTotal)} ・ 支出 {formatYen(expenseTotal)}
            </Text>
          </Row>
          {rows.length === 0 ? (
            <Text variant="body">
              この年の取引はまだありません。下のフォームから追加するか、CSV取込・領収書から
              取り込むと自動で帳簿に保存されます。
            </Text>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>日付</TableHeaderCell>
                  <TableHeaderCell>摘要</TableHeaderCell>
                  <TableHeaderCell>金額（税込）</TableHeaderCell>
                  <TableHeaderCell>勘定科目</TableHeaderCell>
                  <TableHeaderCell>区分</TableHeaderCell>
                  <TableHeaderCell>出所</TableHeaderCell>
                  <TableHeaderCell>操作</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const edit = edits[row.id] ?? toInput(row);
                  const dirty = isDirty(row);
                  return (
                    <tr key={row.id}>
                      <TableCell>
                        <Input
                          type="date"
                          className={styles.cellInput}
                          value={edit.date}
                          onChange={(e) => handleEdit(row.id, { date: e.target.value })}
                          aria-label="日付"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={styles.descriptionInput}
                          value={edit.description}
                          onChange={(e) => handleEdit(row.id, { description: e.target.value })}
                          aria-label="摘要"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className={styles.amountInput}
                          value={edit.amount}
                          onChange={(e) =>
                            handleEdit(row.id, { amount: Number(e.target.value) })
                          }
                          aria-label="金額"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.category}
                          onChange={(e) => handleEdit(row.id, { category: e.target.value })}
                          aria-label="勘定科目"
                        >
                          {CATEGORY_OPTIONS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.income_type}
                          onChange={(e) => handleEdit(row.id, { income_type: e.target.value })}
                          aria-label="区分"
                        >
                          {INCOME_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className={styles.cellInput}
                          value={edit.account}
                          onChange={(e) => handleEdit(row.id, { account: e.target.value })}
                          aria-label="出所"
                        />
                      </TableCell>
                      <TableCell>
                        <Row gap="sm" align="center">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!dirty || busy}
                            onClick={() => void handleSave(row)}
                          >
                            保存
                          </Button>
                          <Button
                            variant={deleteArmedId === row.id ? "danger" : "ghost"}
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleDelete(row)}
                          >
                            {deleteArmedId === row.id ? "本当に削除" : "削除"}
                          </Button>
                        </Row>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Col>
      </Card>
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">取引を追加</Text>
          <div className={styles.addGrid}>
            <Col gap="sm">
              <Text variant="statLabel">日付</Text>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">摘要</Text>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="例: サーバー利用料"
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">金額（支出はマイナス）</Text>
              <Input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">勘定科目</Text>
              <Select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">区分</Text>
              <Select
                value={draft.income_type}
                onChange={(e) => setDraft({ ...draft, income_type: e.target.value })}
              >
                {INCOME_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">出所</Text>
              <Input
                value={draft.account}
                onChange={(e) => setDraft({ ...draft, account: e.target.value })}
              />
            </Col>
          </div>
          <Row gap="sm" align="center">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void handleAdd()}>
              帳簿に追加
            </Button>
            <Text variant="caption">追加・保存・削除はそのまま帳簿データベースに記録されます。</Text>
          </Row>
        </Col>
      </Card>
    </Col>
  );
};
