# eTaxAgent Web デザインシステム

画面の見た目はこの文書と `src/configs/theme.css.ts` のデザイントークンで統一する。
スタイルは Atomic Design の各コンポーネントが自分の `<Component>.css.ts` に持ち、
トークン経由でだけ値を引く。コンポーネント間・画面間での見た目のばらつきはバグとして扱う。

書体は IBM Plex Sans JP（400/500/600/700）。woff2（japanese サブセット）を
`public/fonts/` に自前ホストし、`configs/global.css.ts` の body スタック
（`"IBM Plex Sans JP", "Noto Sans JP", sans-serif`）で一元管理する。各所に直書きしない。
等幅はコード表示専用（ui-monospace 系）で、UI テキストには使わない。

## デザイントークン（`configs/theme.css.ts`）

| グループ | 内容 | 使い方 |
| --- | --- | --- |
| `color` | 意味で命名した色（地 `bg`、面 `surface`、文字 `text`/`textSubtle`/`muted`、アクセント `accent` 系、増減 `positive`/`negative`、警告・エラー、バー3色） | 色リテラルを直書きしない。彩色は意味のある場所だけ |
| `space` | 余白の段階（xs 4 / sm 8 / md 16 / lg 24 / xl 32 / xxl 48） | コンポーネント間・内部の間隔はこの段階から選ぶ |
| `borderRadius` | sm 10 / md 14 / lg 20 / pill | 角丸はこの4種だけ |
| `fontSizes` | xs 12 〜 xxl 26 | 文字サイズは `Text` のバリアント経由を基本にする |
| `fontWeight` | regular / medium / semibold / bold | 数値を直書きしない |
| `lineHeight` / `letterSpacing` | tight / snug / normal、tight / snug / wide | `Text` のバリアントに集約 |
| `shadow` | card / cardHover / button | 影はこの3種だけ。新規の影は作らない |
| `animation` | イージング `spring` / `springSoft` / `springHard` と長さ `durationFast` / `durationBase` / `durationSlow` | 動きはバウンス系イージングで統一（下記） |
| `component` | サイドバー幅、コンテンツ最大幅、カード余白、入力欄余白、表セル余白、バー高さ等、複数箇所で共有する寸法 | 共有寸法はここに足す。1箇所だけの寸法はそのコンポーネントの css.ts に置く |

## 色の方針

- パレットは LP（`public/lp.html`）と共通。地は淡いラベンダーグレー（`bg`）、面は白（`surface`）、基調は濃紺ネイビー（`navy` / `navyDeep`）、アクセントはインディゴ（`accent`）1色、差し色はラベンダー（`lavender`）。
- サイドバーは濃紺グラデーション（`navy` → `navyDeep`）を地にし、選択中ナビは `accent` のピルで満たす。濃紺地の上の文字は `onNavy` / `onNavySubtle`、淡い面は `navySoft` を使う。
- グラデーションはロゴ（下記）とサイドバーの地のみ。
- ロゴは 4 つの算盤珠（菱形・上下円錐）を市松 2 トーンで並べたマーク。React 内では `Logo` atom（variant: mark / icon / banner、tone: brand / reversed / auto）で描き、favicon・PWA・OGP 等の静的用途は `public/` のアセット（favicon.svg、icon-192/512、icon-maskable-512、apple-touch-icon）を使う。濃紺地では reversed（白・ラベンダー）、ワードマークは「e」だけ色を変える。
- 増減は `positive` / `negative`、注意は `warn*`、異常は `error*`。意味のない装飾色を増やさない。

## アニメーションの方針

- 既定の動きはバウンス（`spring` 系イージング＋小さなオーバーシュート）。登場・選択・ホバー・押下に使う。
- 登場: カードはポップ（`Card` に内蔵、並び順の遅延は親の `globalStyle` で付ける）、画面切替はスプリングライズ（`AppTemplate`）。
- 状態変化: 選択中タブ／ナビはポップ、ボタンはホバーで僅かに拡大、押下で縮小、ナビはホバーで右へスライド。
- 無効化したボタンには必ず `disabledReason` を付け、ホバー／フォーカスで理由をツールチップ表示する（Button atom がラッパー経由で表示する）。理由は「変更がありません」「最初のページです」のように、押せない条件をそのまま書く。
- チャートのバーはバネで伸ばす。チャットの吹き出し・通知・バッジもポップで出す。
- `prefers-reduced-motion` の利用者には `configs/global.css.ts` が一律で動きを止める。新規アニメーションもこの対象になるよう、CSS アニメーション／トランジションで実装する。

## ダークモード

- トークンはコントラクト（`createThemeContract`）化し、ライトを `:root`、ダークを `:root[data-theme="dark"]` に割り当てる。コンポーネントは変数経由でしか色を見ないので、切替は変数の差し替えだけで全画面に効く。
- 切替は設定画面（外観）で管理する: ライト / ダーク / 端末に合わせる（`ThemeMode`）。選択は localStorage（`etax-theme`）に保存する。初期値は `index.html` の先行スクリプトが描画前に確定させる。
- ダークで差し替えるのは `color` と `shadow` のみ。余白・角丸・文字・アニメーションは共通。

## レイアウト

- レイアウトはアプリシェル方式: ルートを 100dvh に固定してページ自体はスクロールさせず、スクロールは本文（main）だけが担う。左サイドバーと右パネルはシェルの高さいっぱいに伸び、内側がそれぞれ独立にスクロールする。sticky は使わない（overflow: hidden な祖先の下では効かないため）。
- 左サイドバーの中身: ブランド、年度切替（全画面共通の単一の出所は AppPage の状態）、ナビ、表示中データ。
- 年度は左上のサイドバーで切り替える。各画面は props で受け取るだけで、独自の年度状態を持たない。
- エージェントは右パネル（`AppTemplate` が骨格を持つ）。ドロワーではなくレイアウトを占有するため、開いたままメイン画面を同時操作できる。閉じている間もマウントしたままにして会話状態を保つ。左ナビには載せない。
- 画面下部の細いアクションバー（VS Code のステータスバー相当）は fixed ではなくシェルの一部として最下部に置き、左右パネルの開閉トグル（アイコンのみ）を置く。パネルの開閉は幅アニメーションで、内側は固定幅にして潰れないようにする。開閉ボタンはこのバーに集約し、ヘッダには置かない。サイドバーのナビは左寄せ（アイコン+ラベルを flex-start で並べる）。
- ダッシュボードには freee試算表（実績）を併記できる（サーバーに取り込み済みデータがある場合のみ表示）。
- 「領収書から帳簿」画面: 画像を読み取り（日付・金額・支払先・摘要）、科目判定つきの帳簿ドラフトを作る。
- 勘定科目の判定は 過去の傾向（学習履歴）→ 科目判定AI → キーワードルール の順。ユーザーが確定した対応は学習履歴に記録され、次回から優先される。カード明細CSVの未分類行にも同じ判定を一括で効かせる。
- 「帳簿」画面: DB（Postgres）に保存された取引を年度別に一覧・編集・追加・削除する。CSV取込と領収書の確定内容は帳簿へ自動保存され（年単位の置き換え）、起動時は帳簿があればそれを正として読み込む。申告の数字はこの帳簿から作る。
- 「確定申告」画面: 総合・収支・控除・消費税のタブで構成する。修正は独立した画面を持たず、「控除・計算」を確定した時点の計算結果（確定スナップショット）と現在の入力を比べて差分を出す。所得税額は計算モジュールが算出する（所得控除・税額控除・復興特別所得税・外国税額控除を反映）。
- 「設定」画面: 外観（テーマ）、アカウント（ログイン方法・2要素認証・APIキー）、科目判定AIの接続、分類ルール、課金を管理する。

## ログイン画面

- 左右分割: 左はブランドパネル（`organisms/auth/LoginBrandPanel`）で濃紺グラデーションを地に、主コピー「AIが、すべてやります。」、価値訴求、`WorkflowSteps`（取り込み→帳簿→チェック→レポート→申告書→提出記録の流れが順に弾んで現れる）を持つ。右は `LoginFormPanel` の白カードにモード別のフォームを収める。900px 以下は縦積みで、ブランド側はロゴと見出しだけのコンパクト表示にする（訴求とワークフローは隠す）。
- 認証モード（ログイン／新規登録／TOTP／マジックリンク／送信完了）は見出し・中身とも `LoginMode` で一元化し、切替時は中身がスプリングで入れ替わる。エラーはシェイク付きの `AlertBox` で出す。パスワード欄は表示切替つき（`PasswordField`）、OAuth ボタンは公式ロゴ入り（`OAuthButtons`）。
- コピーの線引き: 自動化の対象は整備ワークフローまでで、申告の最終確認と提出は本人、という注記をブランド側とフォーム側の両方に置く。実績数値などの誇大表示は置かない。

## PWA / レスポンシブ

- `public/manifest.json` + `public/sw.js` でインストール可能な PWA とする。サービスワーカーは画面をネットワーク優先、静的アセットをキャッシュ優先とし、`/api/` はキャッシュしない。本番ビルドでのみ登録する。
- 900px 以下では縦積みレイアウトに切り替え、表は横スクロール可能にする。

## エージェントの画面操作

- エージェントは質問への回答に加え、画面操作を代行する。ツール実行結果（`aggregate_year` / `consumption_tax` / `amendment_delta`）から `AgentUiAction`（年度切替・画面遷移）を導き、`AgentChatPanel` の `onUiAction` 経由で AppPage が実際の状態変更を行う。
- 代行した操作はパネル内に「画面操作: …」として表示する。新しい代行操作を足すときは、ツールと操作の対応を `deriveUiActions` に追加する。

## Atomic Design の置き場所

- atoms: `Button` `Card` `Text` `Badge` `Input` `Select` `Textarea` `Table` 系 `Row` `Col` `Icon` `LoadingCircle`。ドメインを持たない。
- molecules: `Tabs`（横並びのタブ）、`AlertBox`、`Modal`、`Drawer`、`FormField`、`PasswordField`、`MultiSelectFilter`、`HistoryTimeline`、`PageSkeleton`、`TableSkeleton`。
- organisms: 画面領域ごとの機能部品（dashboard / ledger / import / receipt / filing / settings / agent 配下）。
- templates: `AppTemplate`（サイドバー＋ヘッダの骨格）。pages: 画面ごとの配線。
- スタイルの例外は2つだけ: データ由来の値（バーの幅 % など）のインライン指定と、
  子要素への遅延付けなど親から子を狙う `globalStyle`（vanilla-extract の制約による）。
