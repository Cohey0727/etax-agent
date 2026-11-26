import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { InvoiceInput, InvoiceRecord, InvoiceSearchFilters } from "@/api";
import {
  AlertBox,
  AppButton,
  AppText,
  Field,
  ScreenContainer,
  SelectField,
  Sheet,
  SkeletonCard,
} from "@/components";
import { InvoiceDetail } from "@/features/invoices/InvoiceDetail";
import { InvoiceForm } from "@/features/invoices/InvoiceForm";
import { InvoiceList } from "@/features/invoices/InvoiceList";
import { emptyDraft, toInput } from "@/features/invoices/invoiceOptions";
import { useInvoicesData } from "@/features/invoices/useInvoicesData";
import { space } from "@/theme";

type FormState = { kind: "create" } | { kind: "edit"; id: number } | null;

const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
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
  const [draft, setDraft] = useState<InvoiceInput>(() => emptyDraft());
  const [detailId, setDetailId] = useState<number | null>(null);
  // 検索条件の入力値（「検索」を押すまで一覧には反映しない）。
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchStatus, setSearchStatus] = useState("");

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

  const confirmDelete = (invoice: InvoiceRecord) => {
    Alert.alert("請求書を削除しますか", "この下書きは元に戻せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const deleted = await handleDelete(invoice);
            if (deleted) setDetailId(null);
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
      status: searchStatus ? (searchStatus as "draft" | "issued") : undefined,
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
        <Field
          label="発行日（から）"
          hint="YYYY-MM-DD 形式で入力してください"
          onChangeText={setSearchFrom}
          placeholder="2026-01-01"
          value={searchFrom}
        />
        <Field
          label="発行日（まで）"
          hint="YYYY-MM-DD 形式で入力してください"
          onChangeText={setSearchTo}
          placeholder="2026-12-31"
          value={searchTo}
        />
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
            setDetailId(invoiceId);
          }}
        />
      )}

      <Sheet
        onClose={() => (formState ? setFormState(null) : setDetailId(null))}
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
                  setDraft(toInput(correction));
                  setFormState({ kind: "edit", id: correction.id });
                  setDetailId(null);
                }
              })();
            }}
            onDelete={() => confirmDelete(detailInvoice)}
            onEdit={openEdit}
            onIssue={() => {
              void (async () => {
                const issued = await handleIssue(detailInvoice.id);
                if (issued) setDetailId(issued.id);
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
