/**
 * returnFormValues.ts — 申告書第一表・第二表の紙イメージに載せる値の組み立て（services/pdf）。
 *
 * 計算エンジン（@etax/shared）の結果を、様式のセル単位の値へ変換する。
 * 欄の意味は確定申告の手引きの記載方法に従う: 差引所得税額は外国税額控除を
 * 除いた税額控除で引き、基準所得税額（再差引所得税額）は外国税額控除の前の
 * 額、外国税額控除等は「所得税及び復興特別所得税の額」から引く。申告納税額は
 * 100円未満切捨てで、赤字（還付）は切り捨てずにそのまま。第3期分は予定納税
 * との精算。
 */
import {
  CorrectedFigures,
  DeductionInputs,
  IncomeTaxResult,
  ManualIncomeBreakdown,
  MiscIncomeInput,
  SalaryIncomeInput,
  XtxTaxpayer,
} from "@etax/shared";

/** 紙イメージの金額セル識別子。buildReturnPdf のレイアウト表と対応する。 */
export type ReturnAmountKey =
  | "revBusiness"
  | "revAgriculture"
  | "revRealEstate"
  | "revSalary"
  | "revPension"
  | "revMiscBusiness"
  | "revMiscOther"
  | "incBusiness"
  | "incAgriculture"
  | "incRealEstate"
  | "incSalary"
  | "incPension"
  | "incMiscBusiness"
  | "incMiscOther"
  | "incMiscSubtotal"
  | "incTotal"
  | "dedSocial"
  | "dedSmall"
  | "dedLife"
  | "dedEarthquake"
  | "dedWidowSingle"
  | "dedWorkDisability"
  | "dedSpouse"
  | "dedDependents"
  | "dedSpecialRelative"
  | "dedBasic"
  | "dedSubtotal"
  | "dedCasualty"
  | "dedMedical"
  | "dedDonations"
  | "dedTotal"
  | "taxTaxable"
  | "taxBase"
  | "creditDividend"
  | "creditOther"
  | "creditHousing"
  | "creditPolitical"
  | "creditSeismic"
  | "taxAfterCredits"
  | "taxAfterCredits2"
  | "taxReconstruction"
  | "taxTotal"
  | "creditForeign"
  | "withholding"
  | "declaredTax"
  | "prepaid"
  | "thirdPay"
  | "thirdRefund"
  | "amendOriginal"
  | "amendIncrease"
  | "blueDeduction"
  | "dueByDeadline";

/** 紙イメージ1件分の入力。見出し情報＋セル金額＋第二表の内訳。 */
export interface ReturnFormValues {
  /** 対象年（西暦）。見出しの「令和◯年分」に使う。 */
  year: number;
  amendment: boolean;
  /** 提出日（ISO: YYYY-MM-DD）。空文字なら未記入。 */
  submissionDate: string;
  taxpayer: XtxTaxpayer;
  amounts: Partial<Record<ReturnAmountKey, number>>;
  /** その他の税額控除（定額減税）の名称ラベル。該当がなければ空文字。 */
  otherCreditName: string;
  /** 第二表: 社会保険料の内訳1行目の種類名。 */
  socialLabel: string;
  socialPaid: number;
  smallBusinessPaid: number;
  lifePremiums: {
    newGeneral: number;
    oldGeneral: number;
    newPension: number;
    oldPension: number;
    newCareMedical: number;
  };
  earthquakePremiums: { earthquake: number; oldLongTerm: number };
  /** 第二表: 寄附金の支払額（控除額ではなく寄附金額）。 */
  donationsPaid: number;
}

export interface ReturnFormSource {
  year: number;
  amendment: boolean;
  submissionDate: string;
  taxpayer: XtxTaxpayer;
  figures: CorrectedFigures;
  tax: IncomeTaxResult;
  /** 雑所得の入力。第一表カ〜ク・⑦〜⑩に載せる。 */
  miscIncome: MiscIncomeInput;
  /** 給与所得の入力。第一表オに載せる。 */
  salaryIncome: SalaryIncomeInput;
  /** 給与・雑所得の計算内訳（computeManualIncomes の結果）。 */
  manual: ManualIncomeBreakdown;
  deductionInputs: DeductionInputs;
  withholdingTax: number;
  prepaidTax: number;
  originalThirdPeriodTax: number | null;
}

/** 計算結果から紙イメージの値を組み立てる。 */
export function buildReturnFormValues(source: ReturnFormSource): ReturnFormValues {
  const { figures, tax, deductionInputs } = source;
  const d = tax.deductions;
  const c = tax.taxCredits;
  // 災害減免額は扱わないため、基準所得税額は差引所得税額と同額になる。
  const standardTax = tax.taxAfterOtherCredits;
  const taxTotal = standardTax + tax.reconstructionTaxGross;
  // 外国税額控除等は実際に控除できた額: 所得税分は基準所得税額で止める
  // （定額減税と併用すると、所得税分の限度額が定額減税後の基準所得税額を
  // 上回ることがある）。これで「計 − 外国税額控除等」が確定税額の元と一致する。
  const foreignCredit =
    Math.min(c.foreignTaxIncomePart, standardTax) + c.foreignTaxReconstructionPart;
  const declaredRaw = taxTotal - foreignCredit - source.withholdingTax;
  const declaredTax = declaredRaw > 0 ? Math.floor(declaredRaw / 100) * 100 : declaredRaw;
  const thirdPeriod = declaredTax - source.prepaidTax;
  const increase =
    source.amendment && source.originalThirdPeriodTax !== null
      ? Math.max(thirdPeriod - source.originalThirdPeriodTax, 0)
      : 0;

  const amounts: Partial<Record<ReturnAmountKey, number>> = {
    revBusiness: figures.business_revenue,
    revAgriculture: figures.agriculture_revenue,
    revRealEstate: figures.real_estate_revenue,
    revSalary: source.salaryIncome.revenue,
    revPension: source.miscIncome.pensionRevenue,
    revMiscBusiness: source.miscIncome.businessRevenue,
    revMiscOther: source.miscIncome.revenue,
    incBusiness: figures._detail.business_income,
    incAgriculture: figures._detail.agriculture_income,
    incRealEstate: figures._detail.real_estate_income,
    incSalary: source.manual.salary,
    incPension: source.manual.pension,
    incMiscBusiness: source.manual.miscBusiness,
    incMiscOther: source.manual.miscOther,
    incMiscSubtotal: source.manual.miscTotal,
    incTotal: tax.totalIncome,
    dedSocial: d.socialInsurance,
    dedSmall: d.smallBusinessMutualAid,
    dedLife: d.lifeInsurance,
    dedEarthquake: d.earthquakeInsurance,
    dedWidowSingle: d.widow + d.singleParent,
    dedWorkDisability: d.workingStudent + d.disability,
    dedSpouse: d.spouse + d.spouseSpecial,
    dedDependents: d.dependents,
    dedSpecialRelative: d.specialRelative,
    dedBasic: d.basic,
    dedSubtotal: d.total - d.casualtyLoss - d.medical - d.donations,
    dedCasualty: d.casualtyLoss,
    dedMedical: d.medical,
    dedDonations: d.donations,
    dedTotal: d.total,
    taxTaxable: tax.taxableIncome + tax.taxableSeparateStocks + tax.taxableSeparateDividends,
    taxBase: tax.incomeTaxBase,
    creditDividend: c.dividend,
    creditOther: c.flatReduction,
    creditHousing: c.housingLoan,
    creditPolitical: c.politicalDonations + c.certifiedNpoDonations,
    creditSeismic: c.seismicRetrofit,
    taxAfterCredits: standardTax,
    taxAfterCredits2: standardTax,
    taxReconstruction: tax.reconstructionTaxGross,
    taxTotal,
    creditForeign: foreignCredit,
    withholding: source.withholdingTax,
    declaredTax,
    prepaid: source.prepaidTax,
    blueDeduction: figures.blue_deduction,
    dueByDeadline: source.amendment ? increase : Math.max(thirdPeriod, 0),
  };
  if (thirdPeriod > 0) amounts.thirdPay = thirdPeriod;
  if (thirdPeriod < 0) amounts.thirdRefund = -thirdPeriod;
  if (source.amendment && source.originalThirdPeriodTax !== null) {
    amounts.amendOriginal = source.originalThirdPeriodTax;
    amounts.amendIncrease = increase;
  }

  return {
    year: source.year,
    amendment: source.amendment,
    submissionDate: source.submissionDate,
    taxpayer: source.taxpayer,
    amounts,
    otherCreditName: c.flatReduction > 0 ? "定額減税" : "",
    socialLabel: "社会保険料",
    socialPaid: deductionInputs.socialInsurancePaid,
    smallBusinessPaid: deductionInputs.smallBusinessMutualAidPaid,
    lifePremiums: {
      newGeneral: deductionInputs.lifeInsurance.newGeneral,
      oldGeneral: deductionInputs.lifeInsurance.oldGeneral,
      newPension: deductionInputs.lifeInsurance.newPension,
      oldPension: deductionInputs.lifeInsurance.oldPension,
      newCareMedical: deductionInputs.lifeInsurance.newCareMedical,
    },
    earthquakePremiums: {
      earthquake: deductionInputs.earthquakeInsurance.earthquake,
      oldLongTerm: deductionInputs.earthquakeInsurance.oldLongTerm,
    },
    donationsPaid: deductionInputs.donationsTotal,
  };
}
