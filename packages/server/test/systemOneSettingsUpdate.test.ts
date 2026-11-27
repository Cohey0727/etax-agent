/**
 * systemOneSettingsUpdate.test.ts — SystemOne 接続設定の保存（設定画面・MCP・
 * エージェントの3経路）の検証。
 *
 * どの経路でも接続先の SSRF 検証と長さの上限が効くこと、MCP とエージェントでは
 * 渡さなかった項目が保存値のまま残ることを担保する。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSystemOneOverrides, setSystemOneOverrides } from "../src/lib/config";
import { updateSystemOneSettingsForAgent } from "../src/services/agent/agentSettingsTools";
import {
  SystemOneSettingsInputError,
  updateSystemOneSettings,
} from "../src/services/classification/updateSystemOneSettings";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

const privateUrl = "http://169.254.169.254/latest";

const sharedDataDir = process.env.ETAX_DATA_DIR;

beforeEach(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-systemone-settings-"));
  setSystemOneOverrides({});
});

afterEach(() => {
  delete process.env.ETAX_AUTH_MODE;
  // preload が用意した共通のデータフォルダへ戻す（後に流れるテストファイルのため）。
  process.env.ETAX_DATA_DIR = sharedDataDir;
});

describe("updateSystemOneSettings", () => {
  test("空文字の baseUrl / model は保存値を消し、未指定は維持する", async () => {
    await updateSystemOneSettings({ baseUrl: "https://example.com/so", model: "m1", apiKey: "k1" });
    await updateSystemOneSettings({ model: "" });
    expect(getSystemOneOverrides()).toEqual({ baseUrl: "https://example.com/so", apiKey: "k1" });
    await updateSystemOneSettings({ baseUrl: "" });
    expect(getSystemOneOverrides()).toEqual({ apiKey: "k1" });
  });

  test("APIキーは空文字なら維持し、clearApiKey で消す", async () => {
    await updateSystemOneSettings({ baseUrl: "https://example.com/so", apiKey: "k1" });
    await updateSystemOneSettings({ apiKey: "" });
    expect(getSystemOneOverrides().apiKey).toBe("k1");
    await updateSystemOneSettings({ apiKey: "k2", clearApiKey: true });
    expect(getSystemOneOverrides().apiKey).toBeUndefined();
  });

  test("SaaS モードでは内部アドレスの接続先を保存しない", async () => {
    process.env.ETAX_AUTH_MODE = "required";
    await expect(updateSystemOneSettings({ baseUrl: privateUrl })).rejects.toBeInstanceOf(
      SystemOneSettingsInputError,
    );
    expect(getSystemOneOverrides().baseUrl).toBeUndefined();
  });

  test("長すぎる値は保存しない", async () => {
    await expect(
      updateSystemOneSettings({ baseUrl: `https://example.com/${"a".repeat(500)}` }),
    ).rejects.toBeInstanceOf(SystemOneSettingsInputError);
    await expect(updateSystemOneSettings({ model: "m".repeat(201) })).rejects.toBeInstanceOf(
      SystemOneSettingsInputError,
    );
    await expect(updateSystemOneSettings({ apiKey: "k".repeat(501) })).rejects.toBeInstanceOf(
      SystemOneSettingsInputError,
    );
  });
});

describe("エージェントの update_systemone_settings", () => {
  test("SaaS モードでは内部アドレスの接続先を保存しない", async () => {
    process.env.ETAX_AUTH_MODE = "required";
    await expect(updateSystemOneSettingsForAgent({ baseUrl: privateUrl })).rejects.toThrow(
      "内部アドレス",
    );
    expect(getSystemOneOverrides().baseUrl).toBeUndefined();
  });

  test("空文字の項目は変更しない", async () => {
    await updateSystemOneSettings({ baseUrl: "https://example.com/so", model: "m1" });
    await updateSystemOneSettingsForAgent({ baseUrl: "", model: "m2", apiKey: "" });
    expect(getSystemOneOverrides()).toEqual({ baseUrl: "https://example.com/so", model: "m2" });
  });
});

describe("MCP の update_systemone_settings", () => {
  test("渡さなかった base_url / model は保存値のまま残る", async () => {
    await dispatchMcpTool("update_systemone_settings", {
      base_url: "https://example.com/so",
      model: "m1",
    });
    const result = await dispatchMcpTool("update_systemone_settings", { api_key: "k-new" });
    expect(result.isError).toBeUndefined();
    expect(getSystemOneOverrides()).toEqual({
      baseUrl: "https://example.com/so",
      model: "m1",
      apiKey: "k-new",
    });
  });

  test("空文字の base_url で保存値を消せる", async () => {
    await dispatchMcpTool("update_systemone_settings", { base_url: "https://example.com/so" });
    await dispatchMcpTool("update_systemone_settings", { base_url: "" });
    expect(getSystemOneOverrides().baseUrl).toBeUndefined();
  });
});
