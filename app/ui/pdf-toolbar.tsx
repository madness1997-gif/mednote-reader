import { Bookmark, BookmarkCheck, ChevronDown, ChevronLeft, ChevronRight, Download, Minus, PanelLeftOpen, Plus, Printer, Redo2, Settings2, Trash2, Undo2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useActivePdfNavigationController } from "../pdf-navigation-controller";
import { useReaderPaneControllers } from "../workspace-controllers-context";

export type PdfToolbarViewModel = {
  exportAnnotatedPdf: (mode: "download" | "print") => void | Promise<unknown>;
  setSourceZoom: Dispatch<SetStateAction<number>>;
  sourceZoom: number;
  totalPages: number;
};

export function PdfToolbar({ viewModel }: { viewModel: PdfToolbarViewModel }) {
  const { exportAnnotatedPdf, setSourceZoom, sourceZoom, totalPages } = viewModel;
  const { documents, readerInteraction } = useReaderPaneControllers();
  const { PDF_TOOLS, bookmarks, choosePdfTool, pdfHistory, pdfHistoryKey, pdfPanel, pdfTool, redoPdf, setPdfPanel, toggleBookmark, undoPdf } = readerInteraction;
  const navigation = useActivePdfNavigationController();
  const { activeDocument, activeWorkspace, currentDocument: currentPdfDocument, goToPage, sourcePage, switchDocument } = navigation;
  return (<><div className="pane-toolbar pdf-toolbar two-row-toolbar" role="toolbar" aria-label="Công cụ PDF">
            <div className="toolbar-row toolbar-row-primary">
              {!navigation.railVisible && <button className="pdf-toolbar-button" aria-label="Hiện bảng điều hướng" title="Hiện bảng điều hướng" onClick={navigation.showRail}><PanelLeftOpen size={17} /></button>}
              {activeWorkspace.documents.length > 1 ? (
                <select className="document-switcher" value={activeDocument?.id ?? ""} onChange={(event) => switchDocument(event.target.value)} aria-label="Tài liệu trong cụm">
                  {activeWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
                </select>
              ) : <span className="current-document-label">{activeDocument?.name ?? "Tài liệu mẫu"}</span>}
              {activeDocument && <button className="pdf-toolbar-button danger-icon" aria-label="Xóa tài liệu" title="Xóa tài liệu" onClick={() => { void documents.deleteActiveDocument(); }}><Trash2 size={17} /></button>}
              <button className="pdf-toolbar-button" disabled={!activeDocument} onClick={() => { void exportAnnotatedPdf("download"); }} title="Xuất PDF có chú thích" aria-label="Xuất PDF có chú thích"><Download size={17} /><span>Xuất PDF</span></button>
              <button className="pdf-toolbar-button" disabled={!activeDocument} onClick={() => { void exportAnnotatedPdf("print"); }} title="In PDF có chú thích" aria-label="In PDF có chú thích"><Printer size={17} /></button>
              <span className="toolbar-divider" />
              {activeWorkspace.kind !== "empty" && <div className="page-control"><button aria-label="Trang trước" disabled={sourcePage <= 1} onClick={() => goToPage(sourcePage - 1)}><ChevronLeft size={14} /></button><label><input key={`${activeDocument?.id}-${sourcePage}`} defaultValue={sourcePage} inputMode="numeric" aria-label="Số trang" onKeyDown={(event) => { if (event.key === "Enter") goToPage(Number(event.currentTarget.value)); }} onBlur={(event) => goToPage(Number(event.currentTarget.value))} /><span>/ {totalPages}</span></label><button aria-label="Trang sau" disabled={sourcePage >= totalPages} onClick={() => goToPage(sourcePage + 1)}><ChevronRight size={14} /></button></div>}
              <div className="zoom-control"><button aria-label="Thu nhỏ" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom - .1)}><Minus size={15} /></button><span>{Math.round(sourceZoom * 100)}%</span><button aria-label="Phóng to" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom + .1)}><Plus size={15} /></button></div>
              <span className="toolbar-spacer" />
              <button className={`pdf-toolbar-button ${bookmarks.includes(sourcePage) ? "active" : ""}`} disabled={!currentPdfDocument} onClick={toggleBookmark} title="Đánh dấu trang">{bookmarks.includes(sourcePage) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
              <button className={`pdf-toolbar-button menu-trigger ${pdfPanel === "view" ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => setPdfPanel((panel) => panel === "view" ? null : "view")} title="Tùy chọn hiển thị" aria-expanded={pdfPanel === "view"}><Settings2 size={17} /><span>Hiển thị</span><ChevronDown size={12} /></button>
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster" aria-label="Công cụ thao tác PDF">
                {PDF_TOOLS.map(({ id, label, shortLabel, icon: Icon }) => <button key={id} className={`pdf-toolbar-button pdf-mode-button ${pdfTool === id ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => choosePdfTool(id)} title={label} aria-label={label}><Icon size={18} />{pdfTool === id && <span>{shortLabel}</span>}{["pen", "highlight", "area-highlight", "underline", "strikeout", "squiggly", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(id) && <ChevronDown className="tool-chevron" size={11} />}</button>)}
              </div>
              <span className="toolbar-spacer" />
              <button className="pdf-toolbar-button" disabled={!(pdfHistory[pdfHistoryKey]?.undo.length)} onClick={undoPdf} title="Hoàn tác chú thích"><Undo2 size={17} /></button>
              <button className="pdf-toolbar-button" disabled={!(pdfHistory[pdfHistoryKey]?.redo.length)} onClick={redoPdf} title="Làm lại chú thích"><Redo2 size={17} /></button>
            </div>
          </div></>);
}
