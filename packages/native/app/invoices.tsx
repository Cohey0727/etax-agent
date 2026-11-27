import { emptyInvoiceInput, invoiceRecordToInput, latestInvoiceRecord } from "@etax/shared";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { InvoiceInput, InvoiceRecord, InvoiceSearchFilters } from "@/api";
import {
  AlertBox,
  AppButton,
  AppText,
  DateField,
  Field,
  ScreenContainer,
  SelectField,
  Sheet,
  SkeletonCard,
} from "@/components";
import { InvoiceDetail } from "@/features/invoices/InvoiceDetail";
import { InvoiceForm } from "@/features/invoices/InvoiceForm";
import { InvoiceList } from "@/features/invoices/InvoiceList";
import { useInvoicesData } from "@/features/invoices/useInvoicesData";
import { space } from "@/theme";

// 編集・詳細の請求書は、開いたときの値も持つ（検索条件で一覧から外れても消えない）。
type FormState = { kind: "create" } | { kind: "edit"; invoice: InvoiceRecord } | null;

/** 状態の絞り込み。空文字は「すべて」。 */
type StatusFilter = "" | InvoiceRecord["status"];

const STATUS_FILTER_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "issued", label: "発行済み" },
  { value: "draft", label: "下書き" },
];

/**
 * 請求書の画面。一覧＋発行控えの検索（日付・取引先・状態）が主役で、
 * 詳細・作成・編集は1つのシートで切り替える。発行済みは不変のため、
 * 詳細からは PDF の共有と修正書類の作成だけができる。
 */
export default function InvoicesScreen() {
  const {
    status,
    invoices,
    error,
    busy,
    refreshList,
    applyFilters,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleIssue,
    handleCorrect,
    handleSharePdf,
  } = useInvoicesData();
  const [formState, setFormState] = useState<FormState>(null);
  const [draft, setDraft] = useState<InvoiceInput>(() => emptyInvoiceInput());
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  // 検索条件の入力値（「検索」を押すまで一覧には反映しない）。
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchStatus, setSearchStatus] = useState<StatusFilter>("");

  if (status === "loading") {
    return (
      <ScreenContainer>
        <SkeletonCard />
        <SkeletonCard />
      </ScreenContainer>
    );
  }

  if (status === "unavailable") {
    return (
      <ScreenContainer>
        <AlertBox
          tone="warn"
          message="帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。接続されると、この画面で請求書の作成・発行ができるようになります。"
        />
      </ScreenContainer>
    );
  }

  const detailInvoice = latestInvoiceRecord(invoices, detail);
  const editingInvoice =
    formState?.kind === "edit"
      ? latestInvoiceRecord(invoices, formState.invoice)
      : null;

  const openCreate = () => {
    setDraft(emptyInvoiceInput());
    setFormState({ kind: "create" });
  };

  const openEdit = () => {
    if (!detailInvoice) return;
    setDraft(invoiceRecordToInput(detailInvoice));
    setFormState({ kind: "edit", invoice: detailInvoice });
  };

  const submitForm = async () => {
    if (!formState) return;
    if (formState.kind === "create") {
      const created = await handleCreate(draft);
      if (created) {
        setFormState(null);
        setDetail(created);
      }
    } else {
      const updated = await handleUpdate(formState.invoice.id, draft);
      if (updated) {
        setFormState(null);
        setDetail(updated);
      }
    }
  };

  const confirmDelete = (invoice: InvoiceRecord) => {
    Alert.alert("請求書を削除しますか", "この下書きは元に戻せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const deleted = await handleDelete(invoice);
            if (deleted) setDetail(null);
          })();
        },
      },
    ]);
  };

  const runSearch = () => {
    const next: InvoiceSearchFilters = {
      q: searchText || undefined,
      from: searchFrom || undefined,
      to: searchTo || undefined,
      status: searchStatus === "" ? undefined : searchStatus,
    };
    void applyFilters(next);
  };

  const formTitle =
    formState?.kind === "edit"
      ? `請求書を編集${editingInvoice?.corrects_document_number ? `（${editingInvoice.corrects_document_number} の修正）` : ""}`
      : "請求書を作成";

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText size="xxl" weight="bold">
          請求書
        </AppText>
        <AppButton label="請求書を作成" disabled={busy} onPress={openCreate} />
      </View>
      {error ? <AlertBox tone="error" message={error} /> : null}

      <View style={styles.search}>
        <Field
          label="取引先・帳票番号で検索"
          onChangeText={setSearchText}
          placeholder="例: 株式会社サンプル"
          value={searchText}
        />
        <DateField label="発行日（から）" clearable onChange={setSearchFrom} value={searchFrom} />
        <DateField label="発行日（まで）" clearable onChange={setSearchTo} value={searchTo} />
        <SelectField
          label="状態"
          onChange={setSearchStatus}
          options={STATUS_FILTER_OPTIONS}
          value={searchStatus}
        />
        <AppButton label="検索" disabled={busy} loading={busy} onPress={runSearch} />
      </View>

      {invoices.length === 0 ? (
        <AppText>
          条件に合う請求書がありません。「請求書を作成」から下書きを作り、発行すると適格請求書のPDFをダウンロードできます。発行した請求書の控えはここで検索できます。
        </AppText>
      ) : (
        <InvoiceList
          invoices={invoices}
          onSelect={(invoiceId) => {
            setFormState(null);
            setDetail(invoices.find((invoice) => invoice.id === invoiceId) ?? null);
          }}
        />
      )}

      <Sheet
        onClose={() => (formState ? setFormState(null) : setDetail(null))}
        scroll
        title={formState ? formTitle : "請求書の詳細"}
        visible={formState !== null || detailInvoice !== null}
      >
        {formState ? (
          <InvoiceForm
            busy={busy}
            onCancel={() => setFormState(null)}
            onChange={setDraft}
            onSubmit={() => void submitForm()}
            submitLabel={formState.kind === "create" ? "下書きを保存" : "保存する"}
            value={draft}
          />
        ) : detailInvoice ? (
          <InvoiceDetail
            busy={busy}
            invoice={detailInvoice}
            onCorrect={() => {
              void (async () => {
                const correction = await handleCorrect(detailInvoice.id);
                if (correction) {
                  setDraft(invoiceRecordToInput(correction));
                  setFormState({ kind: "edit", invoice: correction });
                  setDetail(null);
                }
              })();
            }}
            onDelete={() => confirmDelete(detailInvoice)}
            onEdit={openEdit}
            onIssue={() => {
              void (async () => {
                const issued = await handleIssue(detailInvoice.id);
                if (issued) setDetail(issued);
              })();
            }}
            onReconciliationChanged={() => void refreshList()}
            onSharePdf={() => void handleSharePdf(detailInvoice)}
          />
        ) : null}
      </Sheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "space-between",
  },
  search: { gap: space.sm },
});
