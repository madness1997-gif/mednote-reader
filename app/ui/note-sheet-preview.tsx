import { FirstAidBlockEditor } from "../first-aid-block-editor";
import { NoteInkCanvas } from "../note-ink-canvas";
import { NoteObjectLayer } from "../note-object-layer";
import { plainTextToRichHtml, type NoteExcerpt, type NotePage, type PaperSize, type TextFont } from "../note-runtime-adapter";
import { firstAidThemeVariables } from "../first-aid-theme";
import { createFirstAidDocument, regularTemplateRichText } from "../first-aid-block-model";
import type { PdfRect } from "../pdf-domain";
import type { ResolvedDocumentSource } from "../note-document-source";

const PAPER_SIZES: Record<PaperSize, { label: string; dimensions: string; width: number; height: number; maxWidth: number }> = {
  a4: { label: "A4", dimensions: "210 × 297 mm", width: 210, height: 297, maxWidth: 720 },
  a5: { label: "A5", dimensions: "148 × 210 mm", width: 148, height: 210, maxWidth: 590 },
  b5: { label: "B5", dimensions: "176 × 250 mm", width: 176, height: 250, maxWidth: 650 },
  letter: { label: "Letter", dimensions: "216 × 279 mm", width: 216, height: 279, maxWidth: 740 },
  square: { label: "Vuông", dimensions: "210 × 210 mm", width: 210, height: 210, maxWidth: 720 },
};

const TEXT_FAMILIES: Record<TextFont, string> = {
  times: '"Times New Roman", Times, serif', segoe: '"Segoe UI", Arial, sans-serif', arial: 'Arial, "Helvetica Neue", sans-serif',
  tahoma: 'Tahoma, "Segoe UI", sans-serif', verdana: 'Verdana, Geneva, sans-serif', trebuchet: '"Trebuchet MS", Arial, sans-serif',
  calibri: 'Calibri, Carlito, "Segoe UI", sans-serif', aptos: 'Aptos, Calibri, "Segoe UI", sans-serif', sans: 'Inter, "Segoe UI", Arial, sans-serif',
  cambria: 'Cambria, Georgia, serif', georgia: 'Georgia, "Times New Roman", serif', palatino: '"Palatino Linotype", Palatino, serif', serif: 'Georgia, "Times New Roman", serif',
  courier: '"Courier New", Courier, monospace', cascadia: '"Cascadia Mono", Consolas, monospace', mono: '"Courier New", monospace', handwriting: '"Segoe Print", "Bradley Hand", cursive',
};

function notePagePresentation(page: NotePage, zoom: number) {
  const selectedSize = PAPER_SIZES[page.paper.size];
  const width = page.paper.orientation === "portrait" ? selectedSize.width : selectedSize.height;
  const height = page.paper.orientation === "portrait" ? selectedSize.height : selectedSize.width;
  const maxWidth = page.paper.orientation === "portrait" ? selectedSize.maxWidth : Math.min(920, selectedSize.maxWidth * 1.32);
  const lineStep = page.paper.template === "ruled-dense" ? 5 : 8;
  return {
    selectedSize,
    pageHeightCss: maxWidth * (height / width),
    paperStyle: {
      "--paper-ratio": `${width} / ${height}`, "--paper-max-width": `${maxWidth}px`, "--note-view-zoom": zoom,
      "--paper-line-step": `${(lineStep / height) * 100}%`, "--paper-cell-x": `${(8 / width) * 100}%`, "--paper-cell-y": `${(8 / height) * 100}%`, "--cornell-header": `${(40 / height) * 100}%`,
      ...(page.paper.template === "first-aid" ? firstAidThemeVariables(page.paper.color) : {}),
    } as React.CSSProperties,
    textLayerStyle: {
      "--text-font": TEXT_FAMILIES[page.text.font] ?? TEXT_FAMILIES.times, "--text-size": `${page.text.size}px`,
      "--text-color": page.text.color === "auto" ? "var(--paper-ink)" : page.text.color, "--text-weight": page.text.bold ? 700 : 400,
      "--text-style": page.text.italic ? "italic" : "normal", "--text-decoration": page.text.underline ? "underline" : "none", "--text-align": page.text.align,
    } as React.CSSProperties,
  };
}

export function estimateNoteSheetFrameHeight(note: NotePage, zoom: number) {
  const presentation = notePagePresentation(note, zoom);
  // Paper + zoomed header + footer + inter-Sheet margin. The value is only
  // used while a virtual Sheet is unmounted; ResizeObserver replaces it with
  // the exact rendered height as soon as the Sheet enters the render window.
  return Math.ceil((presentation.pageHeightCss + 38) * zoom + 42);
}

export type NoteSheetPreviewProps = {
  note: NotePage;
  sheetNumber: number;
  zoom: number;
  loaded: boolean;
  onActivate: () => void;
  resolveSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;
};

export function NoteSheetPreview({ note, sheetNumber, zoom, loaded, onActivate, resolveSource }: NoteSheetPreviewProps) {
  const presentation = notePagePresentation(note, zoom);
  return (
    <section className="note-sheet-frame note-sheet-frame-inactive" data-note-sheet-frame={note.id} style={presentation.paperStyle}>
      <header className="note-sheet-frame-header"><span>Tờ {sheetNumber}</span><button type="button" onClick={onActivate} aria-label={`Chỉnh sửa tờ ${sheetNumber}`}>Chỉnh sửa tờ này</button></header>
      <article data-note-page-id={note.id} className={`note-paper note-paper-preview paper-${note.paper.color} template-${note.paper.template}`} style={presentation.paperStyle} aria-label={`Bản xem trước tờ ${sheetNumber}`}>
        <div className="paper-background" />
        {loaded ? <><div className={`typed-layer ${note.excerpts.length ? "has-excerpts" : ""}`} style={presentation.textLayerStyle}><div className="note-title-input">{note.title}</div>{note.paper.template === "first-aid" ? <FirstAidBlockEditor document={note.firstAid ?? createFirstAidDocument()} mode="view" onChange={() => undefined} onInsertImage={async () => null} onRemoveImage={() => undefined} onRequestPdfCrop={() => undefined} pdfCropResult={null} onPdfCropHandled={() => undefined} pageObjectIds={note.excerpts.map((excerpt) => excerpt.id)} pageObjectLayouts={Object.fromEntries(note.excerpts.map((excerpt) => [excerpt.id, { height: excerpt.layout?.height ?? 0 }]))} pageHeightCss={presentation.pageHeightCss} onTextActivate={() => undefined} onNormalizeTextInput={() => undefined} /> : <div className="note-editor rich-text-editor" dangerouslySetInnerHTML={{ __html: regularTemplateRichText(note.bodyHtml ?? plainTextToRichHtml(note.body), note.body) }} />}<NoteObjectLayer excerpts={note.excerpts} resolveSource={resolveSource} selectedId={null} activeTool="pointer" interactive={false} onSelect={() => undefined} onMove={() => undefined} onEdit={() => undefined} onTextActivate={() => undefined} onNormalizeTextInput={() => undefined} onOpenSource={() => undefined} onDelete={() => undefined} /></div><NoteInkCanvas tool="pointer" color="#2465a8" width={2} penStyle="ballpoint" shape="rectangle" strokes={note.strokes} onCommit={() => undefined} /></> : <div className="note-sheet-preview-loading" role="status">Đang tải nội dung tờ…</div>}
      </article>
      <div className="paper-size">{presentation.selectedSize.label} ({presentation.selectedSize.dimensions}) · {note.paper.orientation === "portrait" ? "Dọc" : "Ngang"}</div>
    </section>
  );
}
