# eTaxAgent サーバー（API + 画面配信）のコンテナイメージ。
# モノレポ構成のままビルドし、画面（packages/web/dist）を同一ポートで配信する。
# ランタイムは Bun のみ（アプリ本体は Python を使わない。python3 + lxml は
# XSD 検証テスト専用の前提で、イメージには入れない）。
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

WORKDIR /app
# 実行用依存だけを入れ直す（devDependencies は持ち込まない）。
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/web/dist ./packages/web/dist

WORKDIR /app/packages/server
EXPOSE 43107
USER bun
CMD ["bun", "run", "src/index.ts"]
