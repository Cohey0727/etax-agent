/**
 * businessStartFormValues.ts — 開業届・青色申告承認申請書に重ねる値の組み立て（services/pdf）。
 *
 * 納税者プロフィール（氏名・住所など）と専用入力（開業日・事業の概要・
 * 簿記方式など）から、様式の各欄へ入れる文字列を用意する。
 * 納税地の区分は住所地（開業届・青色とも番号「5」）を前提にする
 * （プロフィールの住所を納税地とする典型ケース）。
 * 日付欄は様式に元号欄が無いものも含め、元号年で記入する
 * （西暦を求める欄は様式側に「（西暦）」と明記されるため）。
 */
import {
  BusinessStartInputs,
  BusinessStartIncomeType,
  SalarySituationRow,
} from "../../schemas/businessStart";
import { TaxpayerProfile } from "../../schemas/taxpayer";
import { eraDateOf, parseIsoDate, splitPhone, splitZip } from "./formDates";

/** 元号表記の日付（元号名・元号年・月・日）。 */
export interface EraDateParts {
  eraName: string;
  eraYear: number;
  month: number;
  day: number;
}

export interface SalaryRowValues {
  count: number | null;
  terms: string;
  hasTax: boolean | null;
}

function salaryRow(row: SalarySituationRow): SalaryRowValues {
  return { count: row.count, terms: row.terms, hasTax: row.has_tax };
}

/** 開業届（個人事業の開業・廃業等届出書）に重ねる値。 */
export interface OpeningNoticeFormValues {
  taxOfficeName: string;
  submission: EraDateParts | null;
  myNumber: string;
  nameKana: string;
  name: string;
  birth: EraDateParts | null;
  shopNameKana: string;
  shopName: string;
  occupation: string;
  /** 納税地の区分番号（5=住所地）。 */
  domicileKindNumber: string;
  phoneParts: readonly string[];
  zipFirst: string;
  zipSecond: string;
  address: string;
  otherZipFirst: string;
  otherZipSecond: string;
  otherAddress: string;
  incomeTypes: readonly BusinessStartIncomeType[];
  /** 開業・廃業等日。 */
  startDate: EraDateParts | null;
  submitsBlueApplication: boolean;
  submitsConsumptionElection: boolean;
  businessOverview: string;
  salaryFamily: SalaryRowValues;
  salaryEmployee: SalaryRowValues;
  salaryOtherLabel: string;
  salaryOther: SalaryRowValues;
  /** 給与の状況の合計人数（全行に入力がある場合のみ）。 */
  salaryTotalCount: number | null;
  withholdingSpecial: boolean | null;
  salaryStartDate: EraDateParts | null;
  otherNotes: string;
}

/** 青色申告承認申請書に重ねる値。 */
export interface BlueReturnFormValues {
  taxOfficeName: string;
  submission: EraDateParts | null;
  nameKana: string;
  name: string;
  birth: EraDateParts | null;
  shopNameKana: string;
  shopName: string;
  occupation: string;
  domicileKindNumber: string;
  phoneParts: readonly string[];
  zipFirst: string;
  zipSecond: string;
  address: string;
  otherZipFirst: string;
  otherZipSecond: string;
  otherPhoneParts: readonly string[];
  otherAddress: string;
  /** 「◯年分以後」の年分（元号表記）。 */
  startYearEra: { eraName: string; eraYear: number } | null;
  offices: readonly { name: string; location: string }[];
  incomeTypes: readonly BusinessStartIncomeType[];
  cancellationHas: boolean | null;
  cancellationDate: EraDateParts | null;
  /**
   * 4: 本年1月16日以後新たに業務を開始した場合の開始年月日。
   * 該当しない（1月15日以前の開始・開始年が申請年と違う）場合は null。
   */
  businessStartDate: EraDateParts | null;
  inheritanceHas: boolean | null;
  inheritanceDate: EraDateParts | null;
  predecessorName: string;
  bookkeeping: "double" | "simple" | "other" | null;
  bookkeepingOther: string;
  books: readonly string[];
  otherNotes: string;
}

/** プロフィール＋専用入力から開業届の値を組み立てる。 */
export function buildOpeningNoticeFormValues(
  taxpayer: TaxpayerProfile,
  inputs: BusinessStartInputs,
  submissionDate: string,
): OpeningNoticeFormValues {
  const zip = splitZip(taxpayer.zip_code);
  const otherZip = splitZip(inputs.other_zip_code);
  const counts = [
    inputs.salary_family.count,
    inputs.salary_employee.count,
    inputs.salary_other.count,
  ];
  return {
    taxOfficeName: taxpayer.tax_office_name,
    submission: eraDateOf(submissionDate),
    myNumber: taxpayer.my_number.replace(/\D/g, ""),
    nameKana: taxpayer.name_kana,
    name: taxpayer.name,
    birth: eraDateOf(taxpayer.birth_date),
    shopNameKana: inputs.shop_name_kana,
    shopName: taxpayer.shop_name,
    occupation: taxpayer.occupation,
    domicileKindNumber: "5",
    phoneParts: splitPhone(taxpayer.phone),
    zipFirst: zip.first,
    zipSecond: zip.second,
    address: [taxpayer.address, taxpayer.address_line2].filter(Boolean).join(" "),
    otherZipFirst: otherZip.first,
    otherZipSecond: otherZip.second,
    otherAddress: inputs.other_address,
    incomeTypes: inputs.income_types,
    startDate: eraDateOf(inputs.start_date),
    submitsBlueApplication: inputs.submits_blue_application,
    submitsConsumptionElection: inputs.submits_consumption_election,
    businessOverview: inputs.business_overview,
    salaryFamily: salaryRow(inputs.salary_family),
    salaryEmployee: salaryRow(inputs.salary_employee),
    salaryOtherLabel: inputs.salary_other_label,
    salaryOther: salaryRow(inputs.salary_other),
    salaryTotalCount: counts.every((count) => count !== null)
      ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
      : null,
    withholdingSpecial: inputs.withholding_special,
    salaryStartDate: eraDateOf(inputs.salary_start_date),
    otherNotes: inputs.other_notes,
  };
}

/** プロフィール＋専用入力から青色申告承認申請書の値を組み立てる。 */
export function buildBlueReturnFormValues(
  taxpayer: TaxpayerProfile,
  inputs: BusinessStartInputs,
  submissionDate: string,
): BlueReturnFormValues {
  const zip = splitZip(taxpayer.zip_code);
  const otherZip = splitZip(inputs.other_zip_code);
  const startParsed = parseIsoDate(inputs.start_date);
  const startYear = inputs.blue_start_year > 0
    ? inputs.blue_start_year
    : startParsed?.year ?? 0;
  // 4 の欄は「本年（青色申告を開始する年）1月16日以後に開始した場合」だけ書く。
  const businessStartDate =
    startParsed && startYear === startParsed.year &&
    (startParsed.month > 1 || (startParsed.month === 1 && startParsed.day >= 16))
      ? eraDateOf(inputs.start_date)
      : null;
  const startYearEra = startYear > 0
    ? (() => {
        const era = eraDateOf(`${startYear}-01-01`);
        return era ? { eraName: era.eraName, eraYear: era.eraYear } : null;
      })()
    : null;
  return {
    taxOfficeName: taxpayer.tax_office_name,
    submission: eraDateOf(submissionDate),
    nameKana: taxpayer.name_kana,
    name: taxpayer.name,
    birth: eraDateOf(taxpayer.birth_date),
    shopNameKana: inputs.shop_name_kana,
    shopName: taxpayer.shop_name,
    occupation: taxpayer.occupation,
    domicileKindNumber: "5",
    phoneParts: splitPhone(taxpayer.phone),
    zipFirst: zip.first,
    zipSecond: zip.second,
    address: [taxpayer.address, taxpayer.address_line2].filter(Boolean).join(" "),
    otherZipFirst: otherZip.first,
    otherZipSecond: otherZip.second,
    otherPhoneParts: splitPhone(inputs.other_phone),
    otherAddress: inputs.other_address,
    startYearEra,
    offices: inputs.offices,
    incomeTypes: inputs.income_types,
    cancellationHas: inputs.blue_cancellation_has,
    cancellationDate: eraDateOf(inputs.blue_cancellation_date),
    businessStartDate,
    inheritanceHas: inputs.inheritance_has,
    inheritanceDate: eraDateOf(inputs.inheritance_date),
    predecessorName: inputs.predecessor_name,
    bookkeeping: inputs.bookkeeping,
    bookkeepingOther: inputs.bookkeeping_other,
    books: inputs.books,
    otherNotes: inputs.blue_other_notes,
  };
}
