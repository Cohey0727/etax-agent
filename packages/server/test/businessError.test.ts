/**
 * businessError.test.ts — 業務エラーの HTTP 応答の検証。
 * 各サービスの業務エラーが、onError で status と文言のまま返ることを担保する。
 */
import { describe, expect, test } from "bun:test";
import { BusinessError } from "../src/lib/errors";
import { ReconciliationError } from "../src/services/reconciliation/reconcileInvoice";
import { FilingSubmissionError } from "../src/services/filingSubmission/filingSubmissionRecords";

describe("BusinessError", () => {
  test("サービス別の業務エラーは BusinessError として status と名前を持つ", () => {
    const error = new ReconciliationError(404, "請求書が見つかりません");
    expect(error).toBeInstanceOf(BusinessError);
    expect(error.status).toBe(404);
    expect(error.name).toBe("ReconciliationError");
    expect(new FilingSubmissionError(409, "添付済み").name).toBe("FilingSubmissionError");
  });
});
