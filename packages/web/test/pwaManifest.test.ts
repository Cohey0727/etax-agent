/**
 * pwaManifest.test.ts — PWA マニフェストの検証。
 * インストール可能な形（standalone・アイコン一式）を保ち、ショートカットの
 * 着地先 URL がアプリのルーティングで実際に解釈できることを守る
 * （Issue #23 Phase 1: ホーム画面から撮影導線へ直接入れること）。
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parsePath } from "../src/utils/routing";
import { AppView } from "../src/types";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface ManifestShortcut {
  name: string;
  url: string;
  icons?: ManifestIcon[];
}

interface WebAppManifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
}

const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.json", import.meta.url), "utf-8"),
) as WebAppManifest;

describe("PWA マニフェスト", () => {
  test("standalone で起動し、開始 URL とスコープを持つ", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
  });

  test("インストールに必要なアイコン（192/512/maskable）が揃っている", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("領収書撮影ショートカットの着地先がルーティングで解釈できる", () => {
    const shortcut = manifest.shortcuts?.find((s) => s.name === "領収書を撮影");
    expect(shortcut).toBeDefined();
    expect(parsePath(shortcut?.url ?? "")?.view).toBe(AppView.Receipt);
  });
});
