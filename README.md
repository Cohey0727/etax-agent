# eTaxAgent — 確定申告 準備ツール（Webアプリ版）

freee のような会計ソフトの「集計と計算」部分を、決定的な計算モジュールと
LLMエージェントで再構成した、個人事業主向けの確定申告**準備**ツールです。
**数字の計算の正本は本リポジトリの TypeScript 実装（`packages/shared`）です。**
旧 Python CLI 版（`~/workspace/kakutei-agent/`）は参照用レガシーとして残してあり、
新規の計算・修正作業には使いません。

- 銀行・カード明細CSVを取り込み（**列の対応付けはAIが自動判定**）、事業所得 / 不動産所得に振り分けて集計（税込経理）
- 青色申告特別控除（不動産10万 → 事業65万、合計最大75万）を計算
- 消費税を 本則 / 簡易課税（第5種・みなし仕入率50%）/ 2割特例 で比較
- 修正申告用に「申告済み vs 修正後」の差分を出力
- 対話型エージェント（LLM）がツール呼び出しで上記を orchestrate

**金額の計算はすべて決定的な関数（`packages/shared`）で行います。
LLM は会話・CSVマッピングの判定・ツールの選択だけを担当し、数字は作りません。**

## 用語について

ドメイン用語（取引・勘定科目・課税売上・修正申告／更正の請求など）の
正本は [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) です。
コード・画面・文書の用語は同書に従い、レビュー基準も同書にあります。

## 数字の責任範囲

計算モジュール（`packages/shared` の TypeScript 実装が正本。修正パイプライン
`computeCorrectedFigures` を含め、計算はすべて TS 側で完結します）が
責任を持つのは、次の4点です。

1. **事業／不動産への所得の切り分け**（税込経理）
2. **青色申告特別控除**：不動産10万 → 事業65万の順に適用し、
   各区分の控除額はその区分の所得を上限として、合計最大75万
3. **消費税の比較**：本則／簡易課税／2割特例の3方式について、
   納付税額を並べて算出
4. **修正申告の差分**：「申告済み vs 修正後」の項目別差分と税額の増減。
   修正後の数値は、取引データから 1→2→3 のパイプラインで計算することも、
   JSONで直接渡すこともできる

範囲外のもの：簡易課税・2割特例の**適用可否の判定**（基準期間の
課税売上・届出の有無・インボイス登録の経緯など）は計算には含めません。
所得税額そのものの計算（税率表・所得控除の網羅）も行いません。

## 技術スタック

| 層 | 技術 |
|---|---|
| ランタイム / パッケージ | Bun 1.4+（workspaces モノレポ） |
| バックエンド | TypeScript + Hono（port 3001） |
| DB | PostgreSQL 16 + Drizzle ORM（postgres.js ドライバ） |
| フロントエンド | TypeScript + React + Vite（port 5173）+ vanilla-extract |

※ Next.js は使用していません。

### フロントエンドのコーディング規約

`packages/web` は、リポジトリ直下の [CODING_CONVENTIONS.md](./CODING_CONVENTIONS.md)
（Cataris AI フロントエンド規約）に従います。要点:

- Atomic Design を「ドメインを含むか」で分類（atoms / molecules はドメインなし、
  organisms はドメイン別フォルダ、templates、pages）
- コンポーネントは1フォルダ1コンポーネント（`Component.tsx` / `Component.css.ts` /
  `index.ts`）、named export のみ、フォルダ経由でのみ import
- フレックスレイアウトは `Row` / `Col` atoms + `gap`（生の `display: flex`・兄弟 margin 禁止）
- 列挙可能な分岐はトップレベルの対応表（コンポーネント参照）で書き、比較は enum 型の値だけ
- 数値は常に `number` で持ち、文字列化は表示直前（JSX 内）だけ
- state を props から effect で同期しない

本アプリに無い基盤への読み替え: ルーティング（Wouter）は導入せず、画面切替は
`AppView` enum + 対応表（`components/pages/AppPage`）で実施。API クライアントは
orval 生成ではなく `src/utils/api.ts` の手書きラッパー。モーダル基盤（`modal.open`）は
未導入で、確認ダイアログ相当の UI は現在ありません。読み込み表示は共通 atoms の
`LoadingCircle` を使用します。

### バックエンドのコーディング規約

`packages/server` は、リポジトリ直下の [CODING_CONVENTIONS_BACKEND.md](./CODING_CONVENTIONS_BACKEND.md)
（Cataris AI バックエンド規約）に従います。要点:

- レイヤー構成: `routes/`（登録のみ）/ `usecases/`（ルート定義＋ハンドラ、1ファイル1ユースケース）/
  `schemas/`（Zod + `.openapi()` 名）/ `gateways/`（外部API接続はここだけ）/
  `repositories/`（Drizzle データアクセス）/ `services/<ドメイン>/`（共有業務ロジック）/ `lib/`（共通インスタンス・設定）
- ルートは `@hono/zod-openapi` の `createRoute` + `RouteHandler` で定義し、入力は Zod で検証する
- エラーは `HTTPException` で投げ、レスポンスは従来互換の `{ error: string }` 形式に統一する
- 数値は常に `number`（文字列で届く値は受け取り時に変換）、`any` 禁止、`import type` は使わない

本プロジェクトでの読み替え: ORM は規約の Prisma ではなく **Drizzle**（プロジェクトの
技術選定）で、Prisma 向けの規則は Drizzle 相当に読み替える。LLM エンドポイント
（OpenCode Zen 等）には公式SDK・OpenAPIスキーマが無いため、規約の第3選択肢どおり
`gateways/llmGateway.ts` の raw fetch + Zod 検証を使う。検証順序の互換性
（DB未設定・キー未設定の 503 を入力検証の 400 より先に返す）を保つため、
一部エンドポイントはボディ検証をハンドラ側で行う。

## 構成

```
packages/
  shared/   計算エンジン（taxcalc / ledger / サンプルデータ）と共通型。サーバーと画面の両方が使う
    src/taxcalc.ts   所得集計・青色控除・消費税3方式・修正パイプライン／差分の純粋関数
    src/ledger.ts    内部形式CSV取込・科目推定ルール・集計ヘルパー
    src/sample.ts    サンプル取引CSV（ Python版 examples と同一内容）と申告JSON
    test/            bun test（Python版テストの移植）
  server/   Hono API（CODING_CONVENTIONS_BACKEND.md のレイヤー構成）
    src/index.ts     エントリーポイント（ルート合成・CORS・エラー形式の統一）
    src/routes/      ルート登録のみ（health / calc / transactions / imports / agent）
    src/usecases/    ルート定義＋ハンドラ（getHealth / calculateAggregate / importCsv / runAgentChat 等）
    src/schemas/     Zod スキーマ（.openapi 名つき。ErrorSchema は互換のため { error } 形式）
    src/gateways/    llmGateway（OpenAI互換 / Anthropic。raw fetch + Zod検証、UA・セッションヘッダー要件つき）
    src/repositories/ Drizzle スキーマとデータアクセス（transactions / imports）
    src/services/    csvImport（自動マッピング・デコード・パース）/ agent（ツール定義・実行ループ）
    src/lib/         DB遅延初期化・AGENT_* 設定・エラ文言・バリデーションフック
    drizzle/         生成済みマイグレーションSQL
  web/      React アプリ（ダッシュボード / 取引・CSV取込 / 修正申告 / エージェント）
    src/components/atoms      Row / Col / Button / Input / Select / Textarea / Card / Badge / Text / Table / LoadingCircle など
    src/components/molecules  Tabs / AlertBox
    src/components/organisms  dashboard / import / amend / agent のドメイン別パネル
    src/components/templates  AppTemplate（ヘッダー・タブ・フッターの画面骨格）
    src/components/pages      AppPage（画面切替の対応表）＋ 4画面
    src/configs               theme / mediaquery / global スタイル
    src/types                 AppView enum・API型・画面共通 props
    src/utils                 APIラッパー・表示用フォーマッタ
  cli/      スタンドアロン計算CLI（サーバー無しで集計・消費税比較・修正差分）
    src/cli.ts       aggregate / consumption / amend の3コマンド
examples/   サンプル取引CSVと申告JSON（2024年分の original / corrected）
docker-compose.yml  Postgres 16（ユーザーの Mac 上で使用）
```

## セットアップ

```bash
cd ~/workspace/etax-agent
bun install

# DB は SQLite（packages/server/data/etax.db）で、起動時に自動で用意される
cp .env.example .env

# 開発サーバー（API: 3001 / Web: 5173、Web は /api を API へプロキシ）
bun run dev
```

DB（SQLite）が開けない場合でもサーバーは起動し、計算・CSV取込（プレビュー）・画面はそのまま使えます。
取引の保存などDBが必要な API は 503 で理由を返します。

### 環境変数

| 変数 | 意味 |
|---|---|
| `ETAX_DATA_DIR` | 運用データ（SQLite DB・アップロードファイル）の置き場。既定は `packages/server/data` |
| `PORT` | APIサーバーのポート（既定 3001） |
| `AGENT_SCHEMA` | `openai`（OpenAI互換）または `claude`（Anthropic）。既定は `openai` |
| `AGENT_API_KEY` | APIキー。CSVのAIマッピングと対話エージェントでのみ使用 |
| `AGENT_BASE_URL` | 任意。エンドポイントの上書き（既定: OpenRouter `https://openrouter.ai/api/v1` ／ claude 時は `https://api.anthropic.com`） |
| `AGENT_MODEL` | 任意。モデル名の上書き（既定: openai `openai/gpt-4o-mini` ／ claude `claude-sonnet-4-5`） |
| `MCP_TOKEN` | 任意。設定すると `/mcp`（MCP連携）に Bearer 認証を必須にする。公開時は必須 |

OpenCode Go 等の OpenAI 互換エンドポイントも `AGENT_BASE_URL` 差し替えで使えます。
（LLM送信時は `User-Agent: etax-agent/0.1` と `x-opencode-session` ヘッダーを送ります。
前者は Cloudflare の bot 判定回避、後者は OpenCode Go の必須ヘッダーです。）

## CLI（スタンドアロン計算）

サーバーやDBなしで、計算だけをコマンドラインから実行できます（APIキー不要）。

```bash
# 所得の集計と青色申告特別控除
bun run cli -- aggregate --year 2024 --csv examples/sample_transactions.csv

# 消費税の3方式比較（本則 / 簡易 / 2割特例）
bun run cli -- consumption --year 2024 --csv examples/sample_transactions.csv

# 修正申告の差分（修正後は取引データからパイプライン計算）
bun run cli -- amend --year 2024 --original examples/original_2024.json --csv examples/sample_transactions.csv

# 修正申告の差分（修正後をJSONで直接指定。--csv と併用した場合はJSONが優先）
bun run cli -- amend --year 2024 --original examples/original_2024.json --corrected examples/corrected_2024.json
```

`amend` で `--csv` を使う場合、所得税額・住宅借入金等特別控除など取引データから
計算できない項目は申告済みの値を引き継いで差分対象外とし、その旨を出力に明記します。

## CSV取込の自動マッピング

銀行・カード会社ごとにバラバラなCSVの列構成を、ユーザーが手で対応付ける必要はありません。
`POST /api/import/csv` が自動で処理します（列マッピングは自動判定）:

1. **デコード**: バイト列を UTF-8 で厳密に試し、失敗したら Shift_JIS で読みます
   （日本の銀行CSVは Shift_JIS が多いため）。JSON で `contentBase64` を渡す形式にも対応。
2. **マッピング判定**:
   - `AGENT_API_KEY` があれば、ヘッダー＋先頭10行を LLM に渡し、
     「どの列が日付/摘要/金額（または出金・入金）/残高/口座か、日付書式、金額の符号の約束」を
     JSON で返させます。返答は実ヘッダーと照合して検証し、不正なら採用しません。
   - キーが無い／AIが失敗した場合は、キーワード・ヒューリスティクス
     （日付/取引日/お取引日、摘要/内容/ご利用内容、金額/お支払金額/出金、お預入金額/入金、残高 など）
     で自動判定します。どちらでも**ユーザー操作は不要**で、応答の `mappingSource` に
     `"ai"` / `"heuristic"` のどちらで決まったかが入ります。
3. **パース・正規化**: 日付（YYYY/MM/DD・YYYYMMDD・和暦など）を ISO 形式へ、
   金額（全角・カンマ・括弧マイナス・▲など）を符号つき整数へ正規化。
   出金/入金が分かれた形式は 入金 − 出金 で合成します。
   勘定科目はキーワードルールで推定し、所得区分（事業/不動産）も推定します。
   完全重複行は除外します。
4. **保存**: DBがあれば `imports`（マッピング結果つき）と `transactions` に保存します。
   無ければパース結果をプレビューとして返します。

取込画面では、検出されたマッピング（AI判定か自動判定か）と取込結果の表が確認できます。

## API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | 疎通確認（DB・LLMの設定有無を含む） |
| POST | `/api/calc/aggregate` | `{transactions, year?}` → 所得集計＋青色控除（DB不要） |
| POST | `/api/calc/consumption` | `{transactions, year?}` → 消費税3方式の比較（DB不要） |
| POST | `/api/calc/amend` | `{original, corrected, year?}` → 修正申告の差分（DB不要） |
| GET/POST/PUT/DELETE | `/api/transactions(/:id)` | 取引CRUD（DB必須） |
| GET | `/api/imports` | 取込履歴（DB必須） |
| POST | `/api/import/csv` | CSV取込（生バイト or JSON `{filename, content}` / `{filename, contentBase64}`） |
| POST | `/api/agent/chat` | `{messages, transactions}` → エージェント応答（要 `AGENT_API_KEY`） |
| ALL | `/mcp` | MCP（外部エージェント連携。下記） |

### MCP（外部エージェント連携）

`/mcp` は MCP（Model Context Protocol）の Streamable HTTP エンドポイント（ステートレス）。
Muse・Grok 等の MCP クライアントから、サーバーの帳簿DBに対して
集計（aggregate_year）・消費税3方式比較（consumption_tax）・所得税計算（income_tax）・
修正申告の差分（amendment_delta）・取引CRUD（list/add/update/delete_transaction）・
勘定科目の判定と学習（classify_account / classify_feedback）・
XTX出力（export_xtx）・申告ステータス（get/set_filing_status）・
税務知識ベース検索（search_tax_knowledge）が使える。
数字の計算は REST API と同じ決定的な関数のみで行う。e-Tax への提出は行わない。

## 税務知識ベース

エージェント（アプリ内・MCP 共通）が税制のルールや手続きの確認に使う知識ベース。
国税庁タックスアンサー86件を SQLite（FTS5・trigram）に収録し、
`search_tax_knowledge` ツールで検索する。エージェントは不確かな点を推測で答えず、
検索して出典（タックスアンサー No.XXXX）を添える。
法改正時の再収集手順など詳細は [docs/tax-knowledge-base.md](docs/tax-knowledge-base.md)。

クライアント設定例（Claude Code）:

```bash
claude mcp add --transport http etax-agent http://localhost:3001/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

`MCP_TOKEN` 未設定の場合は `--header` は不要（ローカル前提）。

## 検証

```bash
bun run test       # shared の計算テスト（bun test）
bun run typecheck  # shared / server / web の tsc --noEmit
bun run build      # web の vite build
```

検証済みの主な数値（Python版と一致）:

- 簡易課税: 課税売上（税込） ¥15,000,000 → 納付税額 ¥681,818 ／ 2割特例 → ¥272,727
- サンプル2024年分: 事業所得 ¥9,850,500、不動産所得 ¥1,487,000、青色控除 ¥750,000
- 同 消費税: 本則 ¥879,045 ／ 簡易 ¥518,181 ／ 2割特例 ¥207,272
- 修正申告サンプル: 税額差分 +¥135,000
- 非標準ヘッダー（お取引日/ご利用内容/お支払い金額/お預かり金額/差引残高）の
  Shift_JIS 銀行風CSVを、キー無し・自動マッピングで正しく符号つき取引に変換できることを確認

※ この開発VMには Postgres / Docker が無いため、実DBへの保存とマイグレーション適用は
未検証です（マイグレーションSQLの生成までは確認済み）。Mac 側で
`docker compose up -d db && bun run db:migrate` を実行して確認してください。
AIマッピングも実キーでの疎通は未検証です（検証ロジックとフォールバックは実装済み）。

## 計算の前提（重要な仮定）

- 消費税は標準税率10%のみ（軽減税率8%は対象外）。税込経理前提。
- 住宅の家賃は消費税**非課税**として課税売上から除外します
  （事業用賃貸は課税なので、その場合はデータ側で分けてください）。
- 本則課税の仕入税額は、経費CSVからの**概算**（税込経費×10/110、
  租税公課・保険料など課税仕入でない科目を除外）です。
  正式な申告では請求書・インボイスで確定させてください。
- 簡易課税のみなし仕入率はサービス業（第5種）50%を既定としています。
- 2割特例・簡易課税の**適用可否**（基準期間の課税売上、届出の有無、
  インボイス登録の経緯など）は本ツールでは判定しません。計算のみです。
- 青色申告特別控除の65万円は e-Tax申告または電子帳簿保存が前提の金額です
  （紙申告では55万円）。不動産は事業的規模でない前提で10万円です。
- 所得税そのものの税額計算（税率表・所得控除の網羅）は行いません。
  amend の税額差分は、入力JSONに含まれる税額フィールド同士の差です。
- CSV取込時の所得区分の推定は目安です（家賃まわり→不動産所得、
  科目が推定できた取引→事業所得、それ以外→その他）。必要に応じて見直してください。

## 境界（できること・しないこと）

- 本ツールは **計算と下書きの準備専用** です。
- **e-Tax への最終提出は納税者本人が行ってください。**
  税務代理（他人の申告手続きの代行）は税理士の独占業務のため、
  本ツールが提出自体を代行することはありませんし、実装もしていません。
- 出力値はサンプル・概算を含むため、実際の申告前に税務署・税理士への
  確認を推奨します。
