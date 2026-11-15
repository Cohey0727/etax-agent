/**
 * domicileFormValues.ts — 納税地の異動申出書に重ねる値の組み立て（services/pdf）。
 *
 * 納税者プロフィール（異動後の納税地＝現住所、異動・変更前の納税地を含む）から
 * 様式の各欄へ入れる文字列を用意する。異動前・異動後とも住所地を納税地とする
 * 典型ケース（転居）を前提に、様式の区分は「住所地」「住所」に○を付ける。
 */
import { TaxpayerProfile } from "../../schemas/taxpayer";

export interface DomicileFormValues {
  /** 提出先の税務署名（「税務署」は付けない）。 */
  taxOfficeName: string;
  /** 提出日（令和の年・月・日）。日付が読めなければ null（空欄にする）。 */
  submission: { reiwaYear: number; month: number; day: number } | null;
  /** 異動後の郵便番号（印字済みの ― の前後）。 */
  zipFirst: string;
  zipSecond: string;
  /** 異動後の住所（下段と連結）。 */
  address: string;
  /** 電話番号（ハイフン区切りの3部分。区切れなければ全体を1要素）。 */
  phoneParts: readonly string[];
  nameKana: string;
  name: string;
  /** 生年月日（元号名＋元号年・月・日）。日付が読めなければ null。 */
  birth: { eraName: string; eraYear: number; month: number; day: number } | null;
  /** 職業。欄が狭いため、描画側で必要に応じて2行に分ける。 */
  occupation: string;
  shopName: string;
  /** 異動・変更前の郵便番号（印字済みの ― の前後）。 */
  previousZipFirst: string;
  previousZipSecond: string;
  previousAddress: string;
}

/** 令和表記の年月日。ISO 文字列を分解する（不正なら null）。 */
function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const ERA_TABLE: readonly { from: number; name: string }[] = [
  { from: 2019, name: "令和" },
  { from: 1989, name: "平成" },
  { from: 1926, name: "昭和" },
  { from: 1912, name: "大正" },
];

/** 西暦年を元号名＋元号年に変換する。 */
function eraOf(year: number): { eraName: string; eraYear: number } {
  for (const era of ERA_TABLE) {
    if (year >= era.from) return { eraName: era.name, eraYear: year - era.from + 1 };
  }
  return { eraName: "明治", eraYear: year - 1867 };
}

/** 郵便番号を ― の前（3桁）と後（4桁）に分ける。7桁でなければ全体を前に返す。 */
function splitZip(zipCode: string): { first: string; second: string } {
  const digits = zipCode.replace(/\D/g, "");
  if (digits.length === 7) return { first: digits.slice(0, 3), second: digits.slice(3) };
  return { first: zipCode, second: "" };
}

/** プロフィールと提出日から、申出書へ重ねる値を組み立てる。 */
export function buildDomicileFormValues(
  taxpayer: TaxpayerProfile,
  submissionDate: string,
): DomicileFormValues {
  const zip = splitZip(taxpayer.zip_code);
  const previousZip = splitZip(taxpayer.previous_zip_code);
  const submissionParsed = parseIsoDate(submissionDate);
  const birthParsed = parseIsoDate(taxpayer.birth_date);
  const phoneParts = taxpayer.phone.split("-");
  return {
    taxOfficeName: taxpayer.tax_office_name,
    submission: submissionParsed
      ? {
          reiwaYear: submissionParsed.year - 2018,
          month: submissionParsed.month,
          day: submissionParsed.day,
        }
      : null,
    zipFirst: zip.first,
    zipSecond: zip.second,
    address: [taxpayer.address, taxpayer.address_line2].filter(Boolean).join(" "),
    phoneParts: phoneParts.length === 3 ? phoneParts : [taxpayer.phone],
    nameKana: taxpayer.name_kana,
    name: taxpayer.name,
    birth: birthParsed
      ? { ...eraOf(birthParsed.year), month: birthParsed.month, day: birthParsed.day }
      : null,
    occupation: taxpayer.occupation,
    shopName: taxpayer.shop_name,
    previousZipFirst: previousZip.first,
    previousZipSecond: previousZip.second,
    previousAddress: taxpayer.previous_address,
  };
}
