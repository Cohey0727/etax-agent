/**
 * routing.test.ts — URLルーティングと認証クエリ捕捉の検証。
 * Issue #10-1 の再現テスト: メールリンク（?magic=）や外部ログインの
 * 戻り（?auth_error=）は、アプリのURL同期でクエリが消える前に
 * parseAuthQuery で捕捉できなければならない。
 */
import { describe, expect, test } from "bun:test";
import { parseAuthQuery, parsePath, pathForView } from "../src/utils/routing";
import { AppView } from "../src/types";

const EMPTY_AUTH_QUERY = { magic: null, authError: null, verify: null, totpChallenge: null };

describe("parseAuthQuery（認証クエリの捕捉）", () => {
  test("メールリンクのトークンを取り出す", () => {
    expect(parseAuthQuery("?magic=tok-123")).toEqual({ ...EMPTY_AUTH_QUERY, magic: "tok-123" });
  });

  test("外部ログイン失敗の戻りを取り出す", () => {
    expect(parseAuthQuery("?auth_error=access_denied")).toEqual({
      ...EMPTY_AUTH_QUERY,
      authError: "access_denied",
    });
  });

  test("両方ある場合は両方取り出す", () => {
    expect(parseAuthQuery("?magic=tok&auth_error=failed")).toEqual({
      ...EMPTY_AUTH_QUERY,
      magic: "tok",
      authError: "failed",
    });
  });

  test("メール確認トークンと OAuth 後の TOTP チャレンジを取り出す", () => {
    expect(parseAuthQuery("?verify=vtok")).toEqual({ ...EMPTY_AUTH_QUERY, verify: "vtok" });
    expect(parseAuthQuery("?totp_challenge=chal")).toEqual({
      ...EMPTY_AUTH_QUERY,
      totpChallenge: "chal",
    });
  });

  test("クエリが無ければすべて null", () => {
    expect(parseAuthQuery("")).toEqual(EMPTY_AUTH_QUERY);
    expect(parseAuthQuery("?filters=year")).toEqual(EMPTY_AUTH_QUERY);
  });

  test("URLエンコードされたトークンを復号して取り出す", () => {
    expect(parseAuthQuery("?magic=a%2Fb%3Dc").magic).toBe("a/b=c");
  });
});

describe("pathForView / parsePath（従来のルーティング）", () => {
  test("画面と年度からパスを作り、読み戻せる", () => {
    const path = pathForView(AppView.Filing, 2025, "balance");
    expect(path).toBe("/accounts/2025/final-tax/balance");
    expect(parsePath(path)).toEqual({ view: AppView.Filing, year: 2025, filingTab: "balance" });
  });

  test("ルートパスは未知のパスとして null", () => {
    expect(parsePath("/")).toBeNull();
  });
});
