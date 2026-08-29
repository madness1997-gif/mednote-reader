import { PdfToolbar, type PdfToolbarViewModel } from "./pdf-toolbar";
import { PdfReaderStage, type PdfReaderStageViewModel } from "./pdf-reader-stage";

export type ReaderPaneViewModel = {
  toolbar: PdfToolbarViewModel;
  stage: PdfReaderStageViewModel;
};

export function ReaderPane({ viewModel }: { viewModel: ReaderPaneViewModel }) {
  return <section className="reader-pane" tabIndex={-1} aria-label="Reader"><PdfToolbar viewModel={viewModel.toolbar} /><PdfReaderStage viewModel={viewModel.stage} /></section>;
}
