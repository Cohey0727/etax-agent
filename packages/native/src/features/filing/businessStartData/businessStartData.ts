/**
 * businessStartData.ts — 開業届・青色申告承認申請書の専用入力の読み込み。
 *
 * 保存先はサーバーのDB（所有者ごとに1件）。開業は一度きりの手続きで
 * 年度に属さないため、プロフィール（年度別）とは別の保存になる。
 */
import { BusinessStartInputs, SalarySituationRow, fetchBusinessStartInputsResult } from "@/api";

function emptySalaryRow(): SalarySituationRow {
  return { count: null, terms: "", has_tax: null };
}

/** 未保存のときに使う空の専用入力。 */
export function emptyBusinessStartInputs(): BusinessStartInputs {
  return {
    start_date: "",
    shop_name_kana: "",
    business_overview: "",
    income_types: [],
    submits_blue_application: false,
    submits_consumption_election: false,
    other_zip_code: "",
    other_address: "",
    other_phone: "",
    blue_start_year: 0,
    offices: [
      { name: "", location: "" },
      { name: "", location: "" },
    ],
    blue_cancellation_has: null,
    blue_cancellation_date: "",
    inheritance_has: null,
    inheritance_date: "",
    predecessor_name: "",
    bookkeeping: null,
    bookkeeping_other: "",
    books: [],
    blue_other_notes: "",
    salary_family: emptySalaryRow(),
    salary_employee: emptySalaryRow(),
    salary_other_label: "",
    salary_other: emptySalaryRow(),
    withholding_special: null,
    salary_start_date: "",
    other_notes: "",
  };
}

/**
 * 保存済みの専用入力を読み込む。未保存なら空の入力、取得できなければ null
 * （空の入力で始めると、保存したときにサーバーの値を消してしまう）。
 */
export async function loadBusinessStartInputs(): Promise<BusinessStartInputs | null> {
  const result = await fetchBusinessStartInputsResult();
  if (result.kind === "failed") return null;
  if (result.kind === "unsaved") return emptyBusinessStartInputs();
  // 保存値に欠けた項目があっても空の入力で補って使う。
  return { ...emptyBusinessStartInputs(), ...result.value };
}
