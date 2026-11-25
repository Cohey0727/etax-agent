#!/bin/bash
# provision-garage.sh — Garage の初期化とアプリへの接続情報の配布。
#
# 前提:
#   - garage.toml をリポジトリ直下に配置済み（garage.toml.example 参照）
#   - docker compose up -d garage で Garage が起動している
# やること（すべて冪等）:
#   1. クラスタレイアウトの割り当てと適用
#   2. バケット etax-files の作成
#   3. アプリ用アクセスキー etax-app の作成とバケットへの許可
#   4. バケットの CORS 設定（ブラウザ直アップ/直表示のため）
#   5. packages/server/.env へ ETAX_STORAGE_* を追記（未設定の場合のみ）
# 秘密（アクセスキー）は画面に出さず、.env へ直接書き込む。
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="etax-files"
KEY_NAME="etax-app"
ENV_FILE="packages/server/.env"
PUBLIC_ENDPOINT="https://mini-files.spaghetti-monster.com"
LOCAL_ENDPOINT="http://127.0.0.1:43108"

GARAGE="docker compose exec -T garage /garage -c /etc/garage.toml"

echo "== Garage の起動を待っています"
for i in $(seq 1 30); do
  if $GARAGE status >/dev/null 2>&1; then break; fi
  if [ "$i" = "30" ]; then echo "Garage が起動しません。docker compose logs garage を確認してください" >&2; exit 1; fi
  sleep 2
done

NODE_ID=$($GARAGE node id | cut -d@ -f1 | tr -d '[:space:]')
echo "== ノード: ${NODE_ID}"

if $GARAGE layout show | grep -q "${NODE_ID}"; then
  echo "== レイアウトは設定済みです"
else
  echo "== レイアウトを割り当てます"
  $GARAGE layout assign -z dc1 -c 1G "${NODE_ID}"
  $GARAGE layout apply --version 1
fi

if $GARAGE bucket list | grep -q "${BUCKET}"; then
  echo "== バケット ${BUCKET} は作成済みです"
else
  echo "== バケット ${BUCKET} を作成します"
  $GARAGE bucket create "${BUCKET}"
fi

ACCESS_KEY_ID=""
SECRET_ACCESS_KEY=""
if $GARAGE key list | grep -q "${KEY_NAME}"; then
  echo "== キー ${KEY_NAME} は作成済みです（.env の既存値を使います）"
  ACCESS_KEY_ID=$(grep -E '^ETAX_STORAGE_S3_ACCESS_KEY_ID=' "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)
  SECRET_ACCESS_KEY=$(grep -E '^ETAX_STORAGE_S3_SECRET_ACCESS_KEY=' "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)
else
  echo "== キー ${KEY_NAME} を作成します"
  KEY_OUTPUT=$($GARAGE key create "${KEY_NAME}")
  ACCESS_KEY_ID=$(printf '%s' "${KEY_OUTPUT}" | grep -oE 'GK[0-9a-f]+' | head -1)
  SECRET_ACCESS_KEY=$(printf '%s' "${KEY_OUTPUT}" | grep -i "secret key" | awk '{print $NF}')
fi

echo "== バケットへのアクセスを許可します"
$GARAGE bucket allow --read --write --owner "${BUCKET}" --key "${KEY_NAME}" >/dev/null

if [ -n "${ACCESS_KEY_ID}" ] && [ -n "${SECRET_ACCESS_KEY}" ]; then
  APP_ORIGIN=$(grep -E '^ETAX_PUBLIC_URL=' "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)
  if [ -n "${APP_ORIGIN}" ]; then
    echo "== CORS を設定します（origin: ${APP_ORIGIN}）"
    (cd packages/server && \
      CORS_ENDPOINT="${LOCAL_ENDPOINT}" \
      CORS_BUCKET="${BUCKET}" \
      CORS_ACCESS_KEY_ID="${ACCESS_KEY_ID}" \
      CORS_SECRET_ACCESS_KEY="${SECRET_ACCESS_KEY}" \
      CORS_ORIGIN="${APP_ORIGIN}" \
      bun run ../../scripts/setBucketCors.ts)
  else
    echo "== ETAX_PUBLIC_URL が未設定のため CORS 設定を飛ばします（後で再実行してください）"
  fi
else
  echo "== キー情報が取得できないため CORS 設定を飛ばします"
fi

if grep -q '^ETAX_STORAGE_DRIVER=' "${ENV_FILE}"; then
  echo "== .env の ETAX_STORAGE_* は設定済みです"
else
  if [ -z "${ACCESS_KEY_ID}" ] || [ -z "${SECRET_ACCESS_KEY}" ]; then
    echo ".env へ書くキー情報がありません。キー作成直後の初回に実行してください" >&2
    exit 1
  fi
  echo "== .env へ ETAX_STORAGE_* を追記します"
  {
    echo ""
    echo "# ファイルストレージ（Garage / S3互換）。署名付きURLでブラウザが直接やり取りする。"
    echo "ETAX_STORAGE_DRIVER=s3"
    echo "ETAX_STORAGE_S3_ENDPOINT=${PUBLIC_ENDPOINT}"
    echo "ETAX_STORAGE_S3_INTERNAL_ENDPOINT=http://garage:3900"
    echo "ETAX_STORAGE_S3_BUCKET=${BUCKET}"
    echo "ETAX_STORAGE_S3_ACCESS_KEY_ID=${ACCESS_KEY_ID}"
    echo "ETAX_STORAGE_S3_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}"
    echo "ETAX_STORAGE_S3_REGION=garage"
  } >> "${ENV_FILE}"
fi

echo "== 完了。アプリを再作成するとストレージが有効になります: docker compose up -d app"
