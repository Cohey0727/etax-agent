/**
 * domicileFormValues.ts — 納税地の異動申出書に重ねる値の組み立て（services/pdf）。
 *
 * 納税者プロフィール（異動後の納税地＝現住所、異動・変更前の納税地を含む）から
 * 様式の各欄へ入れる文字列を用意する。異動前・異動後とも住所地を納税地とする
 * 典型ケース（転居）を前提に、様式の区分は「住所地」「住所」に○を付ける。
 */
import { TaxpayerProfile } from "../../schemas/taxpayer";
import { eraDateOf, parseIsoDate, splitZip } from "./formDates";

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

/** プロフィールと提出日から、申出書へ重ねる値を組み立てる。 */
export function buildDomicileFormValues(
  taxpayer: TaxpayerProfile,
  submissionDate: string,
): DomicileFormValues {
  const zip = splitZip(taxpayer.zip_code);
  const previousZip = splitZip(taxpayer.previous_zip_code);
  const submissionParsed = parseIsoDate(submissionDate);
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
    birth: eraDateOf(taxpayer.birth_date),
    occupation: taxpayer.occupation,
    shopName: taxpayer.shop_name,
    previousZipFirst: previousZip.first,
    previousZipSecond: previousZip.second,
    previousAddress: taxpayer.previous_address,
  };
}
