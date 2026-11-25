/**
 * setBucketCors.ts — Garage バケットへの CORS ルール設定（scripts）。
 *
 * ブラウザがアプリのオリジンから署名付きURLへ直接 GET/PUT するために必要。
 * Garage は aws-cli の設定が効かない場合があるため、SDK の
 * PutBucketCors を使う（provision-garage.sh から呼ばれる）。
 *
 * 必要な環境変数: CORS_ENDPOINT / CORS_BUCKET / CORS_ACCESS_KEY_ID /
 * CORS_SECRET_ACCESS_KEY / CORS_ORIGIN（アプリの公開オリジン）。
 */
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.CORS_ENDPOINT ?? "";
const bucket = process.env.CORS_BUCKET ?? "";
const accessKeyId = process.env.CORS_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.CORS_SECRET_ACCESS_KEY ?? "";
const origin = process.env.CORS_ORIGIN ?? "";

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !origin) {
  console.error("CORS_* の環境変数が不足しています");
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region: "garage",
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["GET", "HEAD", "PUT"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`CORS を設定しました: bucket=${bucket} origin=${origin}`);
