import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import {
  downloadApiFile, LedgerTransaction, linkReceipt, ReceiptRecord, receiptContentPath, unlinkReceipt,
} from "@/api";
import { AppButton, AppText, Card, Chip, SelectField } from "@/components";
import { formatYen } from "@/utils";

function formatAmount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatYen(Math.abs(value));
}

function transactionLabel(tx: LedgerTransaction): string {
  return `${tx.date} ${tx.description || "（摘要なし）"} ${formatAmount(tx.amount)}`;
}

/** 証憑サムネイル。認証付きで取得したローカルファイルを表示する。 */
function ReceiptThumb({ fileId }: { fileId: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void downloadApiFile(receiptContentPath(fileId), `receipt-${fileId}.img`)
      .then((file) => { if (!cancelled) setUri(file.uri); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [fileId]);
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 10 }} resizeMode="cover" />;
}

export interface ReceiptLibraryProps {
  receipts: ReceiptRecord[] | null;
  ledger: LedgerTransaction[];
  busy: boolean;
  onLink: (receipt: ReceiptRecord, transactionId: number) => Promise<void>;
  onUnlink: (receipt: ReceiptRecord) => Promise<void>;
}

/** 証憑の一覧と、取引への紐付け・解除。 */
export function ReceiptLibrary({ receipts, ledger, busy, onLink, onUnlink }: ReceiptLibraryProps) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  return (
    <Card>
      <AppText size="lg" weight="bold">証憑の一覧</AppText>
      <AppText size="sm" tone="muted">
        解析した領収書画像の一覧です。取引へ紐付けると、帳簿から証憑を辿れるようになります（電子帳簿保存法の相互関連性）。
      </AppText>
      {receipts === null ? (
        <AppText tone="muted">帳簿データベースに接続できないため、証憑の一覧を表示できません。</AppText>
      ) : receipts.length === 0 ? (
        <AppText tone="muted">まだ証憑がありません。上の欄から領収書画像を解析すると、ここに残ります。</AppText>
      ) : (
        receipts.map((receipt) => {
          const linkedTx = receipt.transaction_id !== null
            ? ledger.find((t) => t.id === receipt.transaction_id)
            : undefined;
          return (
            <View key={receipt.file_id} style={{ flexDirection: "row", gap: 12, paddingVertical: 8 }}>
              <ReceiptThumb fileId={receipt.file_id} />
              <View style={{ flex: 1, gap: 6 }}>
                <AppText size="sm">
                  {receipt.extracted
                    ? `${receipt.extracted.date ?? "日付なし"} ${receipt.extracted.payee} ${receipt.extracted.description} ${formatAmount(receipt.extracted.amount)}`
                    : "未解析の証憑"}
                </AppText>
                {receipt.transaction_id !== null ? (
                  <View style={{ gap: 6 }}>
                    <Chip label="紐付け済み" tone="positive" />
                    <AppText size="sm" tone="muted">
                      紐付け先: {linkedTx ? transactionLabel(linkedTx) : `取引ID ${receipt.transaction_id}`}
                    </AppText>
                    <AppButton label="紐付けを外す" variant="ghost" size="sm" disabled={busy} onPress={() => void onUnlink(receipt)} />
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <SelectField
                      label="紐付け先の取引"
                      value={selected[receipt.file_id] ?? ""}
                      options={[
                        { value: "", label: "紐付け先の取引を選ぶ" },
                        ...ledger.map((tx) => ({ value: String(tx.id), label: transactionLabel(tx) })),
                      ]}
                      onChange={(v) => setSelected({ ...selected, [receipt.file_id]: v })}
                    />
                    <AppButton
                      label="紐付ける"
                      size="sm"
                      disabled={busy}
                      onPress={() => {
                        const target = Number(selected[receipt.file_id] ?? "");
                        if (Number.isInteger(target) && target > 0) void onLink(receipt, target);
                      }}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}
