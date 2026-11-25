import { useState } from "react";
import { Badge, Button, Col, Icon, Row, Text } from "@components/atoms";
import { AlertBox, Drawer } from "@components/molecules";
import { FixedAssetInput } from "@types";
import { FixedAssetDetail } from "./FixedAssetDetail";
import { FixedAssetForm } from "./FixedAssetForm";
import { FixedAssetList } from "./FixedAssetList";
import { FixedAssetSkeleton } from "./FixedAssetSkeleton";
import { FixedAssetSummary } from "./FixedAssetSummary";
import { emptyDraft, toInput } from "./fixedAssetOptions";
import { useFixedAssetsData } from "./useFixedAssetsData";

export interface FixedAssetPanelProps {
  /** 集計の対象年度（左上の年度切替から配られる）。 */
  year: number;
}

type FormState = { kind: "create" } | { kind: "edit"; id: number } | null;

/** 固定資産台帳の画面本体。ページはサマリ帯と資産一覧が主役で、詳細・登録・編集はいずれも右 Drawer で開く。 */
export const FixedAssetPanel = ({ year }: FixedAssetPanelProps) => {
  const {
    status,
    assets,
    summary,
    error,
    busy,
    selectedId,
    images,
    imagesBusy,
    deleteArmedId,
    select,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleUploadImages,
    handleDeleteImage,
  } = useFixedAssetsData(year);
  const [formState, setFormState] = useState<FormState>(null);
  const [draft, setDraft] = useState<FixedAssetInput>(() => emptyDraft(year));
  const [detailId, setDetailId] = useState<number | null>(null);

  if (status === "loading") {
    return <FixedAssetSkeleton />;
  }

  if (status === "unavailable") {
    return (
      <AlertBox variant="notice">
        帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。
        接続されると、この画面で固定資産の保存・編集ができるようになります。
      </AlertBox>
    );
  }

  const detailAsset =
    detailId !== null ? (assets.find((asset) => asset.id === detailId) ?? null) : null;
  const editingAsset =
    formState?.kind === "edit"
      ? (assets.find((asset) => asset.id === formState.id) ?? null)
      : null;

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
    const ok =
      formState.kind === "create"
        ? await handleCreate(draft)
        : await handleUpdate(formState.id, draft);
    if (ok) setFormState(null);
  };

  const formTitle =
    formState?.kind === "edit" ? `「${editingAsset?.name ?? ""}」を編集` : "固定資産を登録";

  return (
    <Col gap="lg">
      <Row justify="spaceBetween" align="center" wrap>
        <Text variant="title">固定資産台帳</Text>
        <Button onClick={openCreate} disabled={busy}>
          <Icon name="plus" size={16} /> 資産を登録
        </Button>
      </Row>
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}

      {assets.length === 0 ? (
        <Text variant="body">
          まだ固定資産がありません。「資産を登録」から、パソコンや備品などの
          減価償却資産を登録すると、年度ごとの償却費と残高がここで管理できます。
        </Text>
      ) : (
        <>
          <FixedAssetSummary assets={assets} summary={summary} year={year} />
          <FixedAssetList
            assets={assets}
            year={year}
            selectedId={selectedId}
            images={images}
            onSelect={(assetId) => {
              setFormState(null);
              select(assetId);
              setDetailId(assetId);
            }}
          />
        </>
      )}

      <Drawer
        open={detailAsset !== null}
        title={
          detailAsset ? (
            <Row gap="sm" align="center">
              <Text variant="sectionTitle">{detailAsset.name}</Text>
              {detailAsset.disposed_date ? <Badge>除却済み</Badge> : null}
            </Row>
          ) : undefined
        }
        width="min(720px, 96vw)"
        onClose={() => setDetailId(null)}
      >
        {detailAsset ? (
          <FixedAssetDetail
            asset={detailAsset}
            year={year}
            images={images[detailAsset.id]}
            imagesBusy={imagesBusy}
            busy={busy}
            deleteArmed={deleteArmedId === detailAsset.id}
            onEdit={openEdit}
            onDelete={() => void handleDelete(detailAsset)}
            onUploadImages={(files) => void handleUploadImages(detailAsset.id, files)}
            onDeleteImage={(fileId) => void handleDeleteImage(detailAsset.id, fileId)}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={formState !== null}
        title={formTitle}
        layer={formState?.kind === "edit" ? 1 : 0}
        onClose={() => setFormState(null)}
      >
        {formState ? (
          <FixedAssetForm
            submitLabel={formState.kind === "create" ? "登録する" : "保存する"}
            value={draft}
            busy={busy}
            onChange={setDraft}
            onSubmit={() => void submitForm()}
            onCancel={() => setFormState(null)}
          />
        ) : null}
      </Drawer>
    </Col>
  );
};
