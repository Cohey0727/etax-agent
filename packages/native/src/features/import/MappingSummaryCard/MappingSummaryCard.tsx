import { CsvMapping, ImportCsvResponse } from "@/api";
import { AlertBox, AppButton, AppText, Card, Chip, LabeledValue } from "@/components";
import { View } from "react-native";

const MAPPING_ROWS: readonly { key: keyof CsvMapping; label: string }[] = [
  { key: "dateColumn", label: "日付" },
  { key: "descriptionColumn", label: "摘要" },
  { key: "amountColumn", label: "金額（符号つき1列）" },
  { key: "debitColumn", label: "出金（支払）" },
  { key: "creditColumn", label: "入金" },
  { key: "balanceColumn", label: "残高" },
  { key: "accountColumn", label: "口座" },
];

const AMOUNT_SIGN_DESCRIPTIONS: Record<CsvMapping["amountSign"], string> = {
  split: "出金/入金の2列から合成（入金 − 出金）",
  inverted: "反転して使用",
  "as-is": "そのまま使用（収入が正）",
};

const SOURCE_LABELS: Record<ImportCsvResponse["mappingSource"], string> = {
  ai: "AIが判定",
  heuristic: "キーワードで自動判定",
};

export interface MappingSummaryCardProps {
  result: ImportCsvResponse;
  using: boolean;
  onUse: () => void;
}

/** CSV取込の列マッピングと件数の要約。 */
export function MappingSummaryCard({ result, using, onUse }: MappingSummaryCardProps) {
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <AppText size="lg" weight="bold">検出された列マッピング</AppText>
        <Chip label={SOURCE_LABELS[result.mappingSource]} tone="accent" />
      </View>
      {MAPPING_ROWS.map(({ key, label }) => (
        <LabeledValue key={key} label={label} value={result.mapping[key] ?? "—（なし）"} />
      ))}
      <LabeledValue label="日付書式" value={result.mapping.dateFormat} />
      <LabeledValue label="金額の符号" value={AMOUNT_SIGN_DESCRIPTIONS[result.mapping.amountSign]} />
      <AppText size="sm" tone="muted">
        ファイル: {result.filename}（{result.encoding}）／ 取込 {result.count} 件
        {result.skippedRows > 0 ? ` ／ 読めずスキップ ${result.skippedRows} 件` : ""}
        {result.duplicatesSkipped > 0 ? ` ／ 重複除外 ${result.duplicatesSkipped} 件` : ""}
        {result.persisted ? " ／ DBに保存しました" : " ／ DB未接続のためプレビューのみ（保存されていません）"}
      </AppText>
      {result.persistWarning ? <AlertBox tone="warn" message={result.persistWarning} /> : null}
      <AppButton
        label={result.persisted ? "帳簿を読み直して使う" : "このデータを帳簿に登録する"}
        loading={using}
        onPress={onUse}
      />
    </Card>
  );
}
