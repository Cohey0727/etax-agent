/**
 * fixedAssetImages.test.ts — 固定資産画像（リポジトリ・localストレージ・HTTP経路）。
 *
 * 本番の s3（Garage）経路は署名付きURLでブラウザが直接やり取りするため、
 * ここでは local ドライバで「presign → PUT → 添付 → 一覧 → 配信 → 取り外し」
 * の一連と、未アップロードの添付が弾かれることを担保する。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { createStorageClient, fixedAssetObjectKey } from "../src/gateways/storageGateway";
import { insertFixedAssetRow } from "../src/repositories/fixedAssetRepository";
import {
  deleteFixedAssetImageRow,
  getFixedAssetImageRowByFileId,
  insertFixedAssetImageRow,
  listFixedAssetImageRows,
} from "../src/repositories/fixedAssetImageRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
delete process.env.ETAX_AUTH_MODE;
const dataDir = mkdtempSync(join(tmpdir(), "etax-fixed-asset-images-"));
process.env.ETAX_DATA_DIR = dataDir;

// 1x1 PNG
const PNG_BYTES = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("固定資産画像リポジトリ", () => {
  test("登録・一覧・取得・削除ができる", async () => {
    const db = await createTestDb();
    const asset = await insertFixedAssetRow(db, {
      name: "MacBook Pro",
      quantity: "1台",
      incomeType: "business",
      acquisitionDate: "2026-11-27",
      serviceStartDate: null,
      cost: 446_400,
      usefulLifeYears: 4,
      method: "straight_line",
      businessRatioPercent: 100,
      disposedDate: null,
    });
    const image = await insertFixedAssetImageRow(db, {
      assetId: asset!.id,
      fileId: "file-1",
      mimeType: "image/png",
    });
    expect(image?.assetId).toBe(asset!.id);
    expect((await listFixedAssetImageRows(db, asset!.id)).length).toBe(1);
    expect((await getFixedAssetImageRowByFileId(db, "file-1"))?.id).toBe(image!.id);
    const deleted = await deleteFixedAssetImageRow(db, asset!.id, "file-1");
    expect(deleted?.fileId).toBe("file-1");
    expect((await listFixedAssetImageRows(db, asset!.id)).length).toBe(0);
  });
});

describe("local ストレージゲートウェイ", () => {
  test("save → head → download → deleteObject の往復", async () => {
    const storage = createStorageClient({
      driver: "local",
      filesDir: join(dataDir, "files"),
      s3: null,
      configured: true,
    });
    const key = fixedAssetObjectKey("file-xyz");
    expect(key).toBe("fixed-assets/file-xyz");
    await storage.save(key, PNG_BYTES, "image/png");
    const head = await storage.head(key);
    expect(head?.size).toBe(PNG_BYTES.length);
    expect(head?.contentType).toBe("image/png");
    const downloaded = await storage.download(key);
    expect(Buffer.from(downloaded.dataBase64, "base64").length).toBe(PNG_BYTES.length);
    // local ドライバは署名URLを持たない（配信エンドポイントへ誘導される）。
    expect(await storage.presignDownload(key, 60)).toBeNull();
    await storage.deleteObject(key);
    expect(await storage.head(key)).toBeNull();
  });
});

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

async function req(
  path: string,
  init: { method?: string; json?: unknown; body?: Uint8Array; contentType?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.contentType) headers["Content-Type"] = init.contentType;
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("HTTP: 固定資産画像の流れ", () => {
  test("presign → 直アップロード → 添付 → 一覧 → 配信 → 取り外し", async () => {
    await createTestDb();
    const created = await req("/api/fixed-assets", {
      method: "POST",
      json: {
        name: "MacBook Pro",
        acquisition_date: "2026-11-27",
        cost: 446_400,
        useful_life_years: 4,
      },
    });
    expect(created.status).toBe(201);
    const asset = created.body.asset as { id: number };

    const presign = await req("/api/files/presign-upload", {
      method: "POST",
      json: { contentType: "image/png", purpose: "fixed_asset" },
    });
    expect(presign.status).toBe(200);
    const fileId = presign.body.fileId as string;
    const uploadUrl = presign.body.uploadUrl as string;
    expect(uploadUrl).toContain(`fixed-assets/${fileId}`);

    const put = await req(uploadUrl, { method: "PUT", body: PNG_BYTES, contentType: "image/png" });
    expect(put.status).toBe(200);

    const attached = await req(`/api/fixed-assets/${asset.id}/images`, {
      method: "POST",
      json: { file_id: fileId },
    });
    expect(attached.status).toBe(201);
    const image = attached.body.image as { file_id: string; mime_type: string; url: string };
    expect(image.file_id).toBe(fileId);
    expect(image.mime_type).toBe("image/png");
    expect(image.url).toBe(`/api/fixed-assets/images/${fileId}/content`);

    const list = await req(`/api/fixed-assets/${asset.id}/images`);
    expect(list.status).toBe(200);
    expect((list.body.images as unknown[]).length).toBe(1);

    const contentRes = await appFetch(
      new Request(`http://localhost/api/fixed-assets/images/${fileId}/content`),
    );
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get("content-type")).toContain("image/png");
    expect((await contentRes.arrayBuffer()).byteLength).toBe(PNG_BYTES.length);

    const detached = await req(`/api/fixed-assets/${asset.id}/images/${fileId}`, {
      method: "DELETE",
    });
    expect(detached.status).toBe(200);
    const after = await req(`/api/fixed-assets/${asset.id}/images`);
    expect((after.body.images as unknown[]).length).toBe(0);
  });

  test("アップロードされていないファイルIDの添付は 400", async () => {
    await createTestDb();
    const created = await req("/api/fixed-assets", {
      method: "POST",
      json: {
        name: "デスク",
        acquisition_date: "2026-01-10",
        cost: 80_000,
        useful_life_years: 8,
      },
    });
    const asset = created.body.asset as { id: number };
    const attached = await req(`/api/fixed-assets/${asset.id}/images`, {
      method: "POST",
      json: { file_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(attached.status).toBe(400);
  });

  test("存在しない資産への添付は 404", async () => {
    await createTestDb();
    const attached = await req("/api/fixed-assets/999999/images", {
      method: "POST",
      json: { file_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(attached.status).toBe(404);
  });
});
