/**
 * formDates.test.ts — 様式 PDF へ書く日付の元号変換の検証。
 * 改元のあった年は、年ではなく改元日で元号が分かれることを担保する
 * （生年月日・開業日などは日付で、「◯年分」の年分は年で表す）。
 */
import { describe, expect, test } from "bun:test";
import { eraDateOf, eraOf } from "../src/services/pdf/formDates";
import { buildDomicileFormValues } from "../src/services/pdf/domicileFormValues";
import { buildOpeningNoticeFormValues } from "../src/services/pdf/businessStartFormValues";
import { TaxpayerProfile } from "../src/schemas/taxpayer";
import { BusinessStartInputs } from "../src/schemas/businessStart";

describe("eraDateOf", () => {
  test("改元日の前後で元号が分かれる", () => {
    expect(eraDateOf("1989-01-05")).toEqual({ eraName: "昭和", eraYear: 64, month: 1, day: 5 });
    expect(eraDateOf("1989-01-08")).toEqual({ eraName: "平成", eraYear: 1, month: 1, day: 8 });
    expect(eraDateOf("2019-04-30")).toEqual({ eraName: "平成", eraYear: 31, month: 4, day: 30 });
    expect(eraDateOf("2019-05-01")).toEqual({ eraName: "令和", eraYear: 1, month: 5, day: 1 });
    expect(eraDateOf("1926-12-20")).toEqual({ eraName: "大正", eraYear: 15, month: 12, day: 20 });
    expect(eraDateOf("1912-07-01")).toEqual({ eraName: "明治", eraYear: 45, month: 7, day: 1 });
  });

  test("年分の表記は年で決める（2019年分は令和元年分）", () => {
    expect(eraOf(2019)).toEqual({ eraName: "令和", eraYear: 1 });
  });
});

describe("様式の生年月日", () => {
  const taxpayer: TaxpayerProfile = {
    name: "山田太郎",
    name_kana: "ヤマダタロウ",
    zip_code: "1000001",
    address: "東京都千代田区千代田1-1",
    address_line2: "",
    birth_date: "1989-01-05",
    phone: "090-1234-5678",
    tax_office_name: "麹町",
    tax_office_code: "",
    my_number: "",
    user_id: "",
    occupation: "",
    shop_name: "",
    jan1_address: "",
    invoice_number: "",
    previous_zip_code: "",
    previous_address: "",
  };

  test("異動申出書: 昭和64年生まれを平成1年と書かない", () => {
    const values = buildDomicileFormValues(taxpayer, "2026-11-28");
    expect(values.birth).toEqual({ eraName: "昭和", eraYear: 64, month: 1, day: 5 });
  });

  test("開業届: 昭和64年生まれを平成1年と書かない", () => {
    const inputs: BusinessStartInputs = {
      start_date: "2026-02-10",
      shop_name_kana: "",
      business_overview: "",
      income_types: ["business"],
      submits_blue_application: false,
      submits_consumption_election: false,
      other_zip_code: "",
      other_address: "",
      other_phone: "",
      blue_start_year: 0,
      offices: [],
      blue_cancellation_has: null,
      blue_cancellation_date: "",
      inheritance_has: null,
      inheritance_date: "",
      predecessor_name: "",
      bookkeeping: null,
      bookkeeping_other: "",
      books: [],
      blue_other_notes: "",
      salary_family: { count: null, terms: "", has_tax: null },
      salary_employee: { count: null, terms: "", has_tax: null },
      salary_other_label: "",
      salary_other: { count: null, terms: "", has_tax: null },
      withholding_special: null,
      salary_start_date: "",
      other_notes: "",
    };
    const values = buildOpeningNoticeFormValues(taxpayer, inputs, "2026-11-28");
    expect(values.birth).toEqual({ eraName: "昭和", eraYear: 64, month: 1, day: 5 });
  });
});
