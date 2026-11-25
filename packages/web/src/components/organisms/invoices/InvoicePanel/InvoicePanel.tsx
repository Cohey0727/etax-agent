import { useState } from "react";
import { Button, Col, Icon, Input, Row, Select, Text } from "@components/atoms";
import { AlertBox, Drawer } from "@components/molecules";
import { InvoiceInput } from "@types";
import { InvoiceDetail } from "./InvoiceDetail";
import { InvoiceForm } from "./InvoiceForm";
import { InvoiceList } from "./InvoiceList";
import { InvoiceSkeleton } from "./InvoiceSkeleton";
import styles from "./InvoicePanel.css";
import { emptyDraft, toInput } from "./invoiceOptions";
import { useInvoicesData } from "./useInvoicesData";

type FormState = { kind: "create" } | { kind: "edit"; id: number } | null;

const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "issued", label: "発行済み" },
  { value: "draft", label: "下書き" },
];

/**
 * 請求書の画面本体。一覧＋発行控えの検索（日付・金額・取引先）が主役で、
 * 詳細・作成・編集は右 Drawer で切り替える。発行済みは不変のため、
 * 詳細からは PDF と修正書類の作成だけができる。
 */
export const InvoicePanel = () => {
  const {
    status,
    invoices,
    error,
    busy,
    deleteArmedId,
    setDeleteArmedId,
    applyFilters,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleIssue,
    handleCorrect,
    handleDownloadPdf,
  } = useInvoicesData();
  const [formState, setFormState] = useState<FormState>(null);
  const [draft, setDraft] = useState<InvoiceInput>(() => emptyDraft());
  const [detailId, setDetailId] = useState<number | null>(null);
  // 検索条件の入力値（「検索」を押すまで一覧には反映しない）。
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchStatus, setSearchStatus] = useState("");

  if (status === "loading") {
    return <InvoiceSkeleton />;
  }

  if (status === "unavailable") {
    return (
      <AlertBox variant="notice">
        帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。
        接続されると、この画面で請求書の作成・発行ができるようになります。
      </AlertBox>
    );
  }

  const detailInvoice =
    detailId !== null ? (invoices.find((invoice) => invoice.id === detailId) ?? null) : null;
  const editingInvoice =
    formState?.kind === "edit"
      ? (invoices.find((invoice) => invoice.id === formState.id) ?? null)
      : null;

  const openCreate = () => {
    setDraft(emptyDraft());
    setFormState({ kind: "create" });
  };

  const openEdit = () => {
    if (!detailInvoice) return;
    setDraft(toInput(detailInvoice));
    setFormState({ kind: "edit", id: detailInvoice.id });
  };

  const submitForm = async () => {
    if (!formState) return;
    if (formState.kind === "create") {
      const created = await handleCreate(draft);
      if (created) {
        setFormState(null);
        setDetailId(created.id);
      }
    } else {
      const ok = await handleUpdate(formState.id, draft);
      if (ok) setFormState(null);
    }
  };

  const runSearch = () => {
    void applyFilters({
      q: searchText || undefined,
      from: searchFrom || undefined,
      to: searchTo || undefined,
      status: searchStatus ? (searchStatus as "draft" | "issued") : undefined,
    });
  };

  const formTitle =
    formState?.kind === "edit"
      ? `請求書を編集${editingInvoice?.corrects_document_number ? `（${editingInvoice.corrects_document_number} の修正）` : ""}`
      : "請求書を作成";

  return (
    <Col gap="lg">
      <Row justify="spaceBetween" align="center" wrap>
        <Text variant="title">請求書</Text>
        <Button onClick={openCreate} disabled={busy}>
          <Icon name="plus" size={16} /> 請求書を作成
        </Button>
      </Row>
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}

      <div className={styles.searchGrid}>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-search-q">取引先・帳票番号で検索</label>
          <Input
            id="inv-search-q"
            type="text"
            value={searchText}
            placeholder="例: 株式会社サンプル"
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-search-from">発行日（から）</label>
          <Input
            id="inv-search-from"
            type="date"
            value={searchFrom}
            onChange={(e) => setSearchFrom(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-search-to">発行日（まで）</label>
          <Input
            id="inv-search-to"
            type="date"
            value={searchTo}
            onChange={(e) => setSearchTo(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-search-status">状態</label>
          <Select
            id="inv-search-status"
            value={searchStatus}
            onChange={(e) => setSearchStatus(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={runSearch} disabled={busy}>
          <Icon name="search" size={16} /> 検索
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Text variant="body">
          条件に合う請求書がありません。「請求書を作成」から下書きを作り、発行すると
          適格請求書のPDFをダウンロードできます。発行した請求書の控えはここで検索できます。
        </Text>
      ) : (
        <InvoiceList
          invoices={invoices}
          onSelect={(invoiceId) => {
            setFormState(null);
            setDeleteArmedId(null);
            setDetailId(invoiceId);
          }}
        />
      )}

      <Drawer
        open={formState !== null || detailInvoice !== null}
        title={formState ? formTitle : detailInvoice ? "請求書の詳細" : undefined}
        width="min(860px, 96vw)"
        onClose={() => (formState ? setFormState(null) : setDetailId(null))}
      >
        {formState ? (
          <InvoiceForm
            submitLabel={formState.kind === "create" ? "下書きを保存" : "保存する"}
            value={draft}
            busy={busy}
            onChange={setDraft}
            onSubmit={() => void submitForm()}
            onCancel={() => setFormState(null)}
          />
        ) : detailInvoice ? (
          <InvoiceDetail
            invoice={detailInvoice}
            busy={busy}
            deleteArmed={deleteArmedId === detailInvoice.id}
            onEdit={openEdit}
            onDelete={() => {
              void (async () => {
                const deleted = await handleDelete(detailInvoice);
                if (deleted) setDetailId(null);
              })();
            }}
            onIssue={() => {
              void (async () => {
                const issued = await handleIssue(detailInvoice.id);
                if (issued) setDetailId(issued.id);
              })();
            }}
            onCorrect={() => {
              void (async () => {
                const correction = await handleCorrect(detailInvoice.id);
                if (correction) {
                  setDraft(toInput(correction));
                  setFormState({ kind: "edit", id: correction.id });
                  setDetailId(null);
                }
              })();
            }}
            onDownloadPdf={() => void handleDownloadPdf(detailInvoice)}
          />
        ) : null}
      </Drawer>
    </Col>
  );
};
