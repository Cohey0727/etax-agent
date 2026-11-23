# 税務知識ベース（エージェント用 RAG）

対話エージェントと MCP が、税制のルール・手続きで迷ったときに参照する知識ベース。
出典は **国税庁タックスアンサー**（https://www.nta.go.jp/taxes/shiraberu/taxanswer/）で、
個人事業主の確定申告・消費税まわりを中心に **86件・約17.7万字** を収録している
（収集時点の各ページ表記は「令和8年4月1日現在法令等」）。

金額の計算は従来どおり決定的な関数（`packages/shared`）が担い、本知識ベースは
**制度の確認専用**。エージェントは税率・控除の要件・手続き・期限などで不確かな点を
推測で答えず、まず検索して出典（タックスアンサー No.XXXX）を添えて答えるよう
システムプロンプト（`packages/server/src/services/agent/agentTools.ts`）で指示している。

## 仕組み

| 要素 | 実装 |
|---|---|
| 同梱データ | `packages/server/src/services/knowledge/taxKnowledgeData.ts`（番号・タイトル・分野・出典URL・本文） |
| DB | `knowledge_docs` テーブル（PostgreSQL。title / content の pg_trgm GIN インデックス＋ ILIKE で日本語の部分一致検索） |
| シード | サーバー起動時に `ensureTables` の後で `seedTaxKnowledge()` が同梱データを upsert する（冪等。インデックスは自動維持）。起動ログに「税務知識ベースを準備しました（N件）」が出る |
| 検索 | `packages/server/src/services/knowledge/searchTaxKnowledge.ts`。trigram 部分一致（タイトル一致・出現位置順）が主、3文字未満の語は ILIKE で補完、4桁の出典番号は完全一致を優先 |
| ツール | アプリ内エージェント・MCP の双方に `search_tax_knowledge`（query, limit?） |

収録分野：所得税の基本／必要経費・減価償却／青色申告・記帳／所得控除／税額控除／
申告・納付の手続（修正申告・更正の請求・延滞税を含む）／源泉徴収／消費税
（簡易課税・インボイス・課税売上割合・仕入税額控除を含む）。

## 法改正などで古くなったら（再収集の手順）

収集スクリプトはリポジトリ外の作業フォルダにある。

```bash
cd ~/workspace/tax-knowledge-harvest
bun harvest.ts
```

- 国税庁タックスアンサーの各ページを再取得し、本文を抽出して
  `packages/server/src/services/knowledge/taxKnowledgeData.ts` を再生成する
  （確認用に同フォルダへ `corpus.json` も出す）。失敗したページは `FAIL` として表示される。
- その後はいつもの手順でよい：`bun run typecheck && bun run build` → デプロイ →
  サーバー再起動。**DB 側の手作業は不要**（起動時シードが upsert＋FTS再構築を行う）。
- 再収集の目安：税制改正の施行前後（例：基礎控除や控除額の見直し）、
  消費税の制度変更時。ページ側の「[令和X年4月1日現在法令等]」表記が更新されたら頃合い。

## 収録トピックを増減したいとき

- 対象は `harvest.ts` の `SELECTION`（タックスアンサー番号＋分野名のリスト）で管理する。
  増やすときは番号と分野を足して再収集するだけ。
- 番号→URL の対応は同フォルダの `topics.json`（分野別インデックスから生成）で引く。
  一覧に無い番号はカテゴリ規則で組み立てる。`topics.json` 自体を作り直す場合は
  `bun listTopics.ts` を実行する。
- 本文は1件あたり最大6,000字で切り取る（長大な届出書一覧などは先頭側が残る）。

## 動作確認

サーバー再起動後、エージェントに制度の質問をすると検索が走る。例：

- 「簡易課税の第5種事業のみなし仕入率は何％ですか？」→「50％」＋出典 No.6505 と答えれば正常。
- MCP クライアントからは `search_tax_knowledge` に `{"query": "更正の請求 期限"}` を渡して
  No.2026「確定申告を間違えたとき」が上位に返れば正常。
