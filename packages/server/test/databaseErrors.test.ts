/**
 * databaseErrors.test.ts — DB 由来の例外の分類（応答のステータスと文言の決め手）。
 */
import { describe, expect, test } from "bun:test";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DatabaseError } from "pg";
import { databaseErrorKind } from "../src/lib/errors";

function pgError(code: string): DatabaseError {
  const error = new DatabaseError("pg", 0, "error");
  error.code = code;
  return error;
}

function socketError(code: string): Error {
  return Object.assign(new Error("socket"), { code });
}

describe("databaseErrorKind", () => {
  test("型・範囲・制約の違反（SQLSTATE 22・23）は入力起因", () => {
    expect(databaseErrorKind(new DrizzleQueryError("insert", [1], pgError("22003")))).toBe("input");
    expect(databaseErrorKind(new DrizzleQueryError("insert", [1], pgError("23505")))).toBe("input");
  });

  test("接続断などそれ以外の DB エラーは利用不可", () => {
    expect(databaseErrorKind(new DrizzleQueryError("select", [], pgError("08006")))).toBe("unavailable");
    expect(databaseErrorKind(new DrizzleQueryError("select", [], socketError("ECONNREFUSED")))).toBe(
      "unavailable",
    );
    expect(databaseErrorKind(socketError("ECONNREFUSED"))).toBe("unavailable");
    expect(databaseErrorKind(pgError("57P01"))).toBe("unavailable");
  });

  test("DB と関係の無い例外は対象外", () => {
    expect(databaseErrorKind(new TypeError("x is undefined"))).toBeNull();
    expect(databaseErrorKind(socketError("EPERM"))).toBeNull();
    expect(databaseErrorKind("oops")).toBeNull();
  });
});
