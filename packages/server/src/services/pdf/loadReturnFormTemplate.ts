/**
 * loadReturnFormTemplate.ts — 申告書様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（令和7年分以降用・第一表/第二表）を下地にする。
 * 探索順: 環境変数 ETAX_FORM_PDF_PATH → データフォルダ/forms 配下 → 国税庁サイト
 * （formTemplateLoader）。
 */
import { createFormTemplateLoader } from "./formTemplateLoader";

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export const loadReturnFormTemplate = createFormTemplateLoader({
  file: "shinkokusho-r07-01.pdf",
  url: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/yoshiki/01/shinkokusho/pdf/r07/01.pdf",
  envVar: "ETAX_FORM_PDF_PATH",
});
