import { useRef, useState } from "react";
import { Button, Col, Icon, Row, Text } from "@components/atoms";
import { FixedAssetImageRecord } from "@types";
import styles from "./FixedAssetPanel.css";

export interface FixedAssetImagesProps {
  images: FixedAssetImageRecord[] | undefined;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onDelete: (fileId: string) => void;
}

/**
 * 資産の画像ギャラリー。アップロードは署名付きURLでストレージへ直接行く。
 * クリックで拡大表示、ゴミ箱ボタンは2段階（確認）で削除する。
 */
export const FixedAssetImages = ({ images, busy, onUpload, onDelete }: FixedAssetImagesProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const files = [...fileList];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length > 0) onUpload(files);
  };

  const handleDelete = (fileId: string) => {
    if (deleteArmedId !== fileId) {
      setDeleteArmedId(fileId);
      return;
    }
    setDeleteArmedId(null);
    onDelete(fileId);
  };

  return (
    <Col gap="sm">
      <Row justify="spaceBetween" align="center">
        <Text variant="sectionTitle">画像</Text>
        <Button
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          disabledReason="アップロード中です"
        >
          <Icon name="image" size={16} /> 画像を追加
        </Button>
        <input
          ref={fileInputRef}
          className={styles.hiddenFileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Row>
      {images === undefined ? (
        <Text variant="muted">読み込み中…</Text>
      ) : images.length === 0 ? (
        <Text variant="muted">
          まだ画像がありません。購入時の写真や納品書・請求書の画像を添付できます。
        </Text>
      ) : (
        <div className={styles.galleryGrid}>
          {images.map((image) => (
            <div key={image.file_id} className={styles.galleryItem}>
              <img
                className={styles.galleryImage}
                src={image.url}
                alt=""
                onClick={() => setLightboxUrl(image.url)}
              />
              <button
                type="button"
                className={styles.galleryDelete}
                aria-label={deleteArmedId === image.file_id ? "本当に削除しますか" : "画像を削除"}
                title={deleteArmedId === image.file_id ? "もう一度押すと削除します" : "削除"}
                disabled={busy}
                onClick={() => handleDelete(image.file_id)}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {lightboxUrl ? (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <img className={styles.lightboxImage} src={lightboxUrl} alt="" />
        </div>
      ) : null}
    </Col>
  );
};
