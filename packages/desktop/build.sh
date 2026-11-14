#!/bin/sh
# eTaxAgent デスクトップの同梱物を揃えるビルド手順。
#   web/           画面の静的ファイル（packages/web のビルド成果物）
#   server-bundle/ サーバー本体（Bun バンドル）+ better-sqlite3
#   runtime/       Bun バイナリ（サーバー子プロセスの実行系）
#   main.mjs       Electron メインプロセスのバンドル
set -e
cd "$(dirname "$0")"

echo "== web =="
bun run --cwd ../web build
rm -rf web
cp -r ../web/dist web

echo "== server bundle =="
rm -rf server-bundle
bun build ../server/src/index.ts --target bun --external better-sqlite3 \
  --outfile server-bundle/server.mjs
mkdir -p server-bundle/node_modules
# ワークスペースの node_modules はシンボリックリンクのため、実体をコピーする。
cp -rL ../server/node_modules/better-sqlite3 server-bundle/node_modules/

echo "== bun runtime =="
mkdir -p runtime
cp "$(command -v bun)" runtime/bun
chmod +x runtime/bun

echo "== electron main =="
bun build src/main.ts --target node --external electron --outfile main.mjs

echo "build done"
