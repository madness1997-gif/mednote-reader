import { PdfToolbar, type PdfToolbarScope } from "./pdf-toolbar";
import { PdfReaderStage, type PdfReaderStageScope } from "./pdf-reader-stage";

export type ReaderPaneScope = PdfToolbarScope & PdfReaderStageScope;

export function ReaderPane({ scope }: { scope: ReaderPaneScope }) {
  return <section className="reader-pane" tabIndex={-1} aria-label="Reader"><PdfToolbar scope={scope} /><PdfReaderStage scope={scope} /></section>;
}
