# eTaxAgent サーバー（API + 画面配信）のコンテナイメージ。
# モノレポ構成のままビルドし、画面（packages/web/dist）を同一ポートで配信する。
# ランタイムは Bun が本体。python3 + lxml は XTX 生成時の公式XSD常時検証
# （Issue #28）のエンジンとして実行ステージにだけ入れる（アプリ本体の
# ロジックは Python を使わない）。
# ベースイメージはバージョン固定（mutable な latest は使わない）。
FROM oven/bun:1.4.4 AS builder

WORKDIR /app

# 依存解決を先に行う（ソース変更時のキャッシュ効率のため、清書だけ先にコピー）。
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile

# ソース一式。画面はイメージ内でビルドする。
COPY . .
RUN cd packages/web && bun run build

# 実行ステージ。ビルド成果物と実行に要るものだけを持ち込み、
# 画面ソース・devDependencies 等はイメージに含めない。root では動かさない。
FROM oven/bun:1.4.4 AS runtime

# XSD検証エンジン（python3 + lxml）。検証は生成リクエストのたびに
# サブプロセスで実行する。エンジンが無い環境では検証が「未実施」の
# 警告付き動作に落ちるため、本番では必ず入れる。
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-lxml \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# 実行用依存だけを入れ直す（devDependencies は持ち込まない）。
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile --production
COPY --from=builder --chown=bun:bun /app/packages/shared ./packages/shared
COPY --from=builder --chown=bun:bun /app/packages/server ./packages/server
COPY --from=builder --chown=bun:bun /app/packages/web/dist ./packages/web/dist

WORKDIR /app/packages/server
EXPOSE 43107
USER bun
CMD ["bun", "run", "src/index.ts"]
