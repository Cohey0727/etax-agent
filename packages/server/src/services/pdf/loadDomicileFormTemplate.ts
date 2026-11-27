/**
 * loadDomicileFormTemplate.ts — 納税地の異動申出書様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（所得税・消費税の納税地の異動又は変更に関する申出書、
 * 様式 1060）を下地にする。
 * 探索順: 環境変数 ETAX_DOMICILE_FORM_PDF_PATH → データフォルダ/forms 配下 → 国税庁サイト
 * （formTemplateLoader）。
 */
import { createFormTemplateLoader } from "./formTemplateLoader";

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export const loadDomicileFormTemplate = createFormTemplateLoader({
  file: "nozeichi-idou.pdf",
  url: "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/pdf/h28/07.pdf",
  envVar: "ETAX_DOMICILE_FORM_PDF_PATH",
});
