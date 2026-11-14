# eTaxAgent サーバー（API + 画面配信）のコンテナイメージ。
# モノレポ構成のままビルドし、画面（packages/web/dist）を同一ポートで配信する。
FROM oven/bun:latest

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

WORKDIR /app/packages/server
EXPOSE 43107
CMD ["bun", "run", "src/index.ts"]
