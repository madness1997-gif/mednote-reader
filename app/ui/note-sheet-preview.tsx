import { NoteInkCanvas } from "../note-ink-canvas";
import { NoteObjectLayer } from "../note-object-layer";
import { plainTextToRichHtml, type NoteExcerpt, type NotePage } from "../note-runtime-adapter";
import type { PdfRect } from "../pdf-domain";
import type { ResolvedDocumentSource } from "../note-document-source";

export type NoteSheetPresentation = {
  selectedSize: { label: string; dimensions: string };
  paperStyle: React.CSSProperties;
  textLayerStyle: React.CSSProperties;
};

export type NoteSheetPreviewProps = {
  note: NotePage;
  sheetNumber: number;
  loaded: boolean;
  onActivate: () => void;
  resolveSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;
  presentation: NoteSheetPresentation;
};

export function NoteSheetPreview({ note, sheetNumber, loaded, onActivate, resolveSource, presentation }: NoteSheetPreviewProps) {
  return (
    <section className="note-sheet-frame note-sheet-frame-inactive" data-note-sheet-frame={note.id} style={presentation.paperStyle}>
      <header className="note-sheet-frame-header">
        <span>Tờ {sheetNumber}</span>
        <button type="button" onClick={onActivate} aria-label={`Chỉnh sửa tờ ${sheetNumber}`}>Chỉnh sửa tờ này</button>
      </header>
      <article data-note-page-id={note.id} className={`note-paper note-paper-preview paper-${note.paper.color} template-${note.paper.template}`} style={presentation.paperStyle} aria-label={`Bản xem trước tờ ${sheetNumber}`}>
        <div className="paper-background" />
        {loaded ? <>
          <div className={`typed-layer ${note.excerpts.length ? "has-excerpts" : ""}`} style={presentation.textLayerStyle}>
            <div className="note-title-input">{note.title}</div>
            <div className="note-editor rich-text-editor" dangerouslySetInnerHTML={{ __html: note.bodyHtml ?? plainTextToRichHtml(note.body) }} />
            <NoteObjectLayer excerpts={note.excerpts} resolveSource={resolveSource} selectedId={null} activeTool="pointer" interactive={false} onSelect={() => undefined} onMove={() => undefined} onEdit={() => undefined} onTextActivate={() => undefined} onNormalizeTextInput={() => undefined} onOpenSource={() => undefined} onDelete={() => undefined} />
          </div>
          <NoteInkCanvas tool="pointer" color="#2465a8" width={2} penStyle="ballpoint" shape="rectangle" strokes={note.strokes} onCommit={() => undefined} />
        </> : <div className="note-sheet-preview-loading" role="status">Đang tải nội dung tờ…</div>}
      </article>
      <div className="paper-size">{presentation.selectedSize.label} ({presentation.selectedSize.dimensions}) · {note.paper.orientation === "portrait" ? "Dọc" : "Ngang"}</div>
    </section>
  );
}
