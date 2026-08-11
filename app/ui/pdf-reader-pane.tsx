import { PdfToolbar } from "./pdf-toolbar";
import { PdfReaderStage } from "./pdf-reader-stage";
export function ReaderPane({ scope }: { scope: Record<string, any> }) { return <section className="reader-pane"><PdfToolbar scope={scope} /><PdfReaderStage scope={scope} /></section>; }
