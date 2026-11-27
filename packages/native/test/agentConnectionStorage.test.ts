import { asyncStorage, secureStore } from "./nativeMocks";
import { beforeEach, describe, expect, test } from "bun:test";

const { clearAgentConnection, loadAgentConnection, saveAgentConnection } = await import(
  "../src/features/settings/agentConnectionStorage"
);

const CONFIG = { baseUrl: "https://llm.example.com/v1", model: "m-1", apiKey: "sk-secret" };

describe("agentConnectionStorage", () => {
  beforeEach(() => {
    asyncStorage.clear();
    secureStore.clear();
  });

  test("APIキーは安全な保存領域にだけ置き、AsyncStorage には平文で残さない", async () => {
    await saveAgentConnection(1, CONFIG);
    const plain = [...asyncStorage.values()].join("\n");
    expect(plain).not.toContain("sk-secret");
    expect([...secureStore.values()]).toContain("sk-secret");
    expect(await loadAgentConnection(1)).toEqual(CONFIG);
  });

  test("ユーザーごとに分けて保存し、他のユーザーには見えない", async () => {
    await saveAgentConnection(1, CONFIG);
    expect(await loadAgentConnection(2)).toEqual({ baseUrl: "", model: "", apiKey: "" });
  });

  test("消すと APIキーも消える", async () => {
    await saveAgentConnection(1, CONFIG);
    await clearAgentConnection(1);
    expect(await loadAgentConnection(1)).toEqual({ baseUrl: "", model: "", apiKey: "" });
    expect(secureStore.size).toBe(0);
  });

  test("ユーザーを区別しない平文の保存値は読まずに消す", async () => {
    asyncStorage.set("etax.agent-connection", JSON.stringify(CONFIG));
    expect(await loadAgentConnection(1)).toEqual({ baseUrl: "", model: "", apiKey: "" });
    expect(asyncStorage.has("etax.agent-connection")).toBe(false);
  });
});
