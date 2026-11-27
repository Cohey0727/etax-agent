import { xtxSupportedYears } from "@etax/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppButtonVariant, AppText } from "@/components";
import {
  ExportXtxRequest,
  XtxTaxpayerInput,
  exportDomicilePdfFile,
  exportReturnPdfFile,
  exportXtxFile,
  saveBase64ToCacheFile,
  saveTextToCacheFile,
  shareFile,
} from "@/api";
import { space } from "@/theme";
import { EtaxImportGuide } from "../EtaxImportGuide";

type ExportKind = "xtx" | "returnPdf" | "domicilePdf";

/** 出力ボタンの並び。XTX は対応年分だけ出力できる。 */
const exportActions: readonly {
  kind: ExportKind;
  label: string;
  variant: AppButtonVariant;
  requiresXtxSupport: boolean;
  failureMessage: string;
}[] = [
  {
    kind: "xtx",
    label: "e-Tax用データを出力（XTX）",
    variant: "primary",
    requiresXtxSupport: true,
    failureMessage: "XTXの出力に失敗しました",
  },
  {
    kind: "returnPdf",
    label: "申告書の紙イメージ（PDF）",
    variant: "ghost",
    requiresXtxSupport: false,
    failureMessage: "紙イメージ PDF の出力に失敗しました",
  },
  {
    kind: "domicilePdf",
    label: "納税地の異動申出書（PDF）",
    variant: "ghost",
    requiresXtxSupport: false,
    failureMessage: "異動申出書 PDF の出力に失敗しました",
  },
];

const notExporting: Readonly<Record<ExportKind, boolean>> = {
  xtx: false,
  returnPdf: false,
  domicilePdf: false,
};

export interface ReturnExportActionsProps {
  year: number;
  /** 納税者プロフィール。読み込めていないときは null で、出力できない。 */
  taxpayer: XtxTaxpayerInput | null;
  /** 提出日（YYYY-MM-DD） */
  submissionDate: string;
  /** 申告書（XTX・紙イメージ）の出力内容を組み立てる。 */
  buildRequest: (taxpayer: XtxTaxpayerInput) => ExportXtxRequest;
}

/**
 * 提出パネルの出力ボタン（XTX・申告書の紙イメージ・納税地の異動申出書）と、
 * 出力結果の案内。生成ファイルは端末に保存して共有シートで渡す。
 */
export function ReturnExportActions({
  year,
  taxpayer,
  submissionDate,
  buildRequest,
}: ReturnExportActionsProps) {
  const [exporting, setExporting] = useState<Readonly<Record<ExportKind, boolean>>>(notExporting);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // XTX出力直後の取り込みガイドと、公式XSD検証を行えなかった場合の警告。
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [xsdWarning, setXsdWarning] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);

  const run = async (action: (typeof exportActions)[number], profile: XtxTaxpayerInput) => {
    const { kind } = action;
    setExporting((current) => ({ ...current, [kind]: true }));
    setMessage(null);
    setError(null);
    if (kind === "xtx") {
      setExportedFilename(null);
      setXsdWarning(null);
    }
    try {
      setMessage(await exportFile(kind, profile));
    } catch (e) {
      setError(e instanceof Error ? e.message : action.failureMessage);
    } finally {
      setExporting((current) => ({ ...current, [kind]: false }));
    }
  };

  const exportFile = async (kind: ExportKind, profile: XtxTaxpayerInput): Promise<string> => {
    switch (kind) {
      case "xtx": {
        const result = await exportXtxFile(buildRequest(profile));
        await shareFile(saveTextToCacheFile(result.filename, result.xtx), "application/xml");
        setExportedFilename(result.filename);
        setXsdWarning(result.xsd_warning);
        return `${result.filename} を保存しました。下の手順で e-Taxソフト（WEB版）に取り込んでください。`;
      }
      case "returnPdf": {
        const result = await exportReturnPdfFile(buildRequest(profile));
        await shareFile(saveBase64ToCacheFile(result.filename, result.pdf_base64), "application/pdf");
        return `${result.filename} を保存しました。公式様式に数字を重ねた確認用のイメージです（提出はXTXで行ってください）。`;
      }
      case "domicilePdf": {
        const result = await exportDomicilePdfFile({
          year,
          submission_date: submissionDate,
          taxpayer: profile,
        });
        await shareFile(saveBase64ToCacheFile(result.filename, result.pdf_base64), "application/pdf");
        return `${result.filename} を保存しました。公式様式にプロフィールを記入した印刷用の申出書です。印刷して、異動後の納税地を所轄する税務署へ提出してください（郵送も可）。`;
      }
      default:
        return kind satisfies never;
    }
  };

  return (
    <View style={styles.wrap}>
      {error ? <AlertBox tone="error" message={error} /> : null}
      {message ? <AlertBox tone="success" message={message} /> : null}
      {xsdWarning ? (
        <AlertBox
          tone="warn"
          message={`公式XMLスキーマでの検証は行えませんでした: ${xsdWarning} XTXは出力されていますが、取り込み時に内容をよく確認してください。`}
        />
      ) : null}
      {exportedFilename ? <EtaxImportGuide filename={exportedFilename} /> : null}

      <View style={styles.actions}>
        {exportActions.map((action) => (
          <AppButton
            key={action.kind}
            label={exporting[action.kind] ? "出力中…" : action.label}
            variant={action.variant}
            disabled={
              (action.requiresXtxSupport && !supported) || exporting[action.kind] || !taxpayer
            }
            loading={exporting[action.kind]}
            onPress={() => {
              if (taxpayer) void run(action, taxpayer);
            }}
          />
        ))}
      </View>
      {!supported ? (
        <AppText size="sm" tone="muted">
          {year}年分はXTX出力に未対応です（対応: {xtxSupportedYears().join("・")}年分）
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  actions: { gap: space.sm },
});
