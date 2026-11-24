/**
 * uploadTypes.test.ts — アップロード Content-Type のホワイトリスト検証（Issue #7）。
 * presign スキーマの許可値と lib の許可値が一致することも確認する。
 */
import { describe, expect, test } from "bun:test";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  isAllowedUploadContentType,
  normalizeContentType,
  servedContentType,
} from "../src/lib/uploadTypes";
import { UploadableImageMimeTypeSchema } from "../src/schemas/file";

describe("アップロード Content-Type", () => {
  test("presign スキーマと lib のホワイトリストが一致する", () => {
    expect([...UploadableImageMimeTypeSchema.options].sort()).toEqual(
      [...ALLOWED_UPLOAD_CONTENT_TYPES].sort(),
    );
  });

  test("画像タイプだけを許可し、パラメータつきも正規化して判定する", () => {
    expect(isAllowedUploadContentType("image/png")).toBe(true);
    expect(isAllowedUploadContentType("image/jpeg; charset=binary")).toBe(true);
    expect(isAllowedUploadContentType("IMAGE/PNG")).toBe(true);
    expect(isAllowedUploadContentType("text/html")).toBe(false);
    expect(isAllowedUploadContentType("image/svg+xml")).toBe(false);
    expect(isAllowedUploadContentType("application/pdf")).toBe(false);
    expect(isAllowedUploadContentType("")).toBe(false);
  });

  test("配信タイプはホワイトリスト外を octet-stream に落とす", () => {
    expect(servedContentType("image/png")).toBe("image/png");
    expect(servedContentType("text/html")).toBe("application/octet-stream");
    expect(servedContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(normalizeContentType(undefined)).toBe("");
  });
});
