import { isFixedAssetInYear } from "@etax/shared";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { FixedAssetInput, FixedAssetRecord } from "@/api";
import {
  AlertBox,
  AppButton,
  AppText,
  ScreenContainer,
  SelectField,
  Sheet,
  SkeletonCard,
  SwitchRow,
} from "@/components";
import { FixedAssetDetail } from "@/features/assets/FixedAssetDetail";
import { FixedAssetForm } from "@/features/assets/FixedAssetForm";
import { FixedAssetList } from "@/features/assets/FixedAssetList";
import { FixedAssetSummary } from "@/features/assets/FixedAssetSummary";
import { emptyDraft, toInput } from "@/features/assets/assetOptions";
import { useAssetsData } from "@/features/assets/useAssetsData";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";

type FormState = { kind: "create" } | { kind: "edit"; id: number } | null;

/**
 * 固定資産台帳の画面。サマリ帯と資産一覧が主役で、詳細・登録・編集は
 * 1つのシートで切り替える（編集はシートを重ねず、その場で切り替わる）。
 * 一覧は選択年度の対象資産が既定で、対象外の資産はトグルで広げる。
 */
export default function AssetsScreen() {
  const { year, years, setYear } = useAppState();
  const {
    status,
    assets,
    summary,
    error,
    busy,
    images,
    imagesBusy,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleUploadImage,
    handleDeleteImage,
  } = useAssetsData(year);
  const [formState, setFormState] = useState<FormState>(null);
  const [draft, setDraft] = useState<FixedAssetInput>(() => emptyDraft(year));
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showPastAssets, setShowPastAssets] = useState(false);

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
          message="帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。接続されると、この画面で固定資産の保存・編集ができるようになります。"
        />
      </ScreenContainer>
    );
  }

  const detailAsset =
    detailId !== null ? (assets.find((asset) => asset.id === detailId) ?? null) : null;
  const editingAsset =
    formState?.kind === "edit" ? (assets.find((asset) => asset.id === formState.id) ?? null) : null;
  const inYearAssets = assets.filter((asset) => isFixedAssetInYear(asset, year));
  const pastCount = assets.length - inYearAssets.length;
  const visibleAssets = showPastAssets ? assets : inYearAssets;

  const openCreate = () => {
    setDraft(emptyDraft(year));
    setFormState({ kind: "create" });
  };

  const openEdit = () => {
    if (!detailAsset) return;
    setDraft(toInput(detailAsset));
    setFormState({ kind: "edit", id: detailAsset.id });
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

  const confirmDelete = (asset: FixedAssetRecord) => {
    Alert.alert("固定資産を削除しますか", `「${asset.name}」と添付画像が削除されます。`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const deleted = await handleDelete(asset);
            if (deleted) setDetailId(null);
          })();
        },
      },
    ]);
  };

  const formTitle =
    formState?.kind === "edit" ? `「${editingAsset?.name ?? ""}」を編集` : "固定資産を登録";

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText size="xxl" weight="bold">
          固定資産台帳
        </AppText>
        <AppButton label="資産を登録" disabled={busy} onPress={openCreate} />
      </View>
      <SelectField
        label="対象年度"
        onChange={(next) => setYear(Number(next))}
        options={years.map((y) => ({ value: String(y), label: `${y}年` }))}
        value={String(year)}
      />
      {error ? <AlertBox tone="error" message={error} /> : null}

      {assets.length === 0 ? (
        <AppText>
          まだ固定資産がありません。「資産を登録」から、パソコンや備品などの減価償却資産を登録すると、年度ごとの償却費と残高がここで管理できます。
        </AppText>
      ) : (
        <>
          <FixedAssetSummary assets={assets} summary={summary} year={year} />
          {pastCount > 0 ? (
            <SwitchRow
              label={`過去の資産も表示（${pastCount}件）`}
              onChange={setShowPastAssets}
              value={showPastAssets}
            />
          ) : null}
          {visibleAssets.length === 0 ? (
            <AppText>
              {year}年に対象の資産はありません。「過去の資産も表示」をオンにすると、すべての資産を確認できます。
            </AppText>
          ) : (
            <FixedAssetList
              assets={visibleAssets}
              images={images}
              onSelect={(assetId) => {
                setFormState(null);
                setDetailId(assetId);
              }}
              year={year}
            />
          )}
        </>
      )}

      <Sheet
        onClose={() => (formState ? setFormState(null) : setDetailId(null))}
        scroll
        title={formState ? formTitle : detailAsset ? detailAsset.name : ""}
        visible={formState !== null || detailAsset !== null}
      >
        {formState ? (
          <FixedAssetForm
            busy={busy}
            onCancel={() => setFormState(null)}
            onChange={setDraft}
            onSubmit={() => void submitForm()}
            submitLabel={formState.kind === "create" ? "登録する" : "保存する"}
            value={draft}
          />
        ) : detailAsset ? (
          <FixedAssetDetail
            asset={detailAsset}
            busy={busy}
            images={images[detailAsset.id]}
            imagesBusy={imagesBusy}
            onDelete={() => confirmDelete(detailAsset)}
            onDeleteImage={(fileId) => void handleDeleteImage(detailAsset.id, fileId)}
            onEdit={openEdit}
            onUploadImage={(uri, mimeType) =>
              void handleUploadImage(detailAsset.id, uri, mimeType)
            }
            year={year}
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
});
