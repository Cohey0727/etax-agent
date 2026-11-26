# eTaxAgent ネイティブアプリ（@etax/native）

React Native + Expo の iOS / Android アプリ。計算は Web・サーバーと同一の
`@etax/shared`（TypeScript 計算コア）を import して行う。

- アプリ ID：iOS / Android ともに `jp.co.occam.etaxagent`
- ルーティング：expo-router（`app/` 配下）
- API 接続先：環境変数 `EXPO_PUBLIC_API_URL` で差し替え可能。既定は本番
  （`https://mini-etaxapi.spaghetti-monster.com`）

## 開発

リポジトリルートで `bun install` したうえで、このディレクトリで実行する。

```sh
bun run start     # Expo 開発サーバー
bun run typecheck # 型チェック
bun run export    # バンドル生成（動作確認用）
bun run android   # 実機・エミュレータへ release ビルドでインストール
bun run ios       # 実機・シミュレータへ Release 構成でインストール
```

`android` / `ios` は release ビルドが既定。debug ビルドで動かす場合は
`bun run android:debug` / `bun run ios:debug` を使う。

実機・ストア向けビルドは EAS Build を使う（後述）。

## OTA 更新（EAS Update）

JS のみの変更は EAS Update でストア審査なしに配信できる。

- `app.json` の `updates.url` と `extra.eas.projectId` は現在プレースホルダ
  （全ゼロの UUID）。そのため `updates.enabled` は `false` にしてあり、
  起動時の更新確認は行われない。EAS 初期化時に実プロジェクト ID へ
  差し替えたうえで `updates.enabled` を `true` に戻すこと。
- `runtimeVersion` は `appVersion` ポリシー。アプリのバージョンが上がると
  旧バージョン向けの更新は配信されなくなる。ネイティブコードを変更した
  場合は OTA では届かないため、バージョンを上げてストアへ提出する。
- チャネルは eas.json のビルドプロファイルと対応する
  （development / preview / production）。

### EAS 初期化の手順（Expo アカウントが必要）

1. `bun x eas-cli login` で Expo アカウントにログインする。
2. このディレクトリで `bun x eas-cli init` を実行し、プロジェクトを作成する。
   生成されたプロジェクト ID を `app.json` の `extra.eas.projectId` と
   `updates.url`（`https://u.expo.dev/<プロジェクトID>`）の両方へ反映する。
3. ビルド：`bun x eas-cli build --profile preview --platform all`
4. 更新配信：`bun x eas-cli update --channel preview --message "<内容>"`

## マイナンバーカード読み取り

将来のネイティブモジュールとして `modules/mynumber-nfc/` に置き場を用意して
ある。方針と注意点は同ディレクトリの README を参照。

## 備考

- 起動画面はアプリ側のアニメーションスプラッシュのみ。ネイティブ
  スプラッシュは背景色だけの無地にしてあり、フォント読み込み完了時点で
  すぐ消える。
- ログインはパスワード / TOTP / マジックリンク / Google・GitHub OAuth に
  対応し、セッションは SecureStore に保持される。OAuth の戻りは
  `etaxagent://auth-callback` で受け取る。
