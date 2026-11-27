import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, StyleSheet, View } from "react-native";
import { FixedAssetImageRecord, imageSource } from "@/api";
import { AppButton, AppText, BouncePressable, Sheet, SkeletonBar } from "@/components";
import { radius, space } from "@/theme";

export interface FixedAssetImagesProps {
  images: FixedAssetImageRecord[] | undefined;
  busy: boolean;
  onUpload: (uri: string, mimeType: string) => void;
  onDelete: (fileId: string) => void;
}

/**
 * 資産の画像ギャラリー。端末の写真ライブラリから選んで添付する。
 * タップで拡大表示、削除は確認ダイアログを挟む。
 */
export function FixedAssetImages({ images, busy, onUpload, onDelete }: FixedAssetImagesProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("写真へのアクセスが許可されていません", "設定アプリから写真へのアクセスを許可してください。");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled) return;
    for (const picked of result.assets) {
      onUpload(picked.uri, picked.mimeType ?? "image/jpeg");
    }
  };

  const confirmDelete = (fileId: string) => {
    Alert.alert("画像を削除しますか", "添付した画像を取り外し、実体も削除されます。", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: () => onDelete(fileId) },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText size="lg" weight="bold">
          画像
        </AppText>
        <AppButton
          label="画像を追加"
          variant="ghost"
          size="sm"
          disabled={busy}
          loading={busy}
          onPress={() => void pickImages()}
        />
      </View>
      {images === undefined ? (
        <SkeletonBar width="100%" height={72} />
      ) : images.length === 0 ? (
        <AppText size="sm" tone="muted">
          まだ画像がありません。購入時の写真や納品書・請求書の画像を添付できます。
        </AppText>
      ) : (
        <View style={styles.grid}>
          {images.map((image) => (
            <View key={image.file_id} style={styles.item}>
              <BouncePressable
                accessibilityRole="button"
                accessibilityLabel="画像を拡大"
                onPress={() => setLightboxUrl(image.url)}
              >
                <Image source={imageSource(image.url)} style={styles.image} />
              </BouncePressable>
              <AppButton
                label="削除"
                variant="danger"
                size="sm"
                disabled={busy}
                onPress={() => confirmDelete(image.file_id)}
              />
            </View>
          ))}
        </View>
      )}
      <Sheet onClose={() => setLightboxUrl(null)} title="画像" visible={lightboxUrl !== null}>
        {lightboxUrl ? <Image source={imageSource(lightboxUrl)} style={styles.lightbox} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  item: { alignItems: "center", gap: space.xs },
  image: { borderRadius: radius.md, height: 96, width: 96 },
  lightbox: { borderRadius: radius.md, height: 320, width: "100%" },
});
