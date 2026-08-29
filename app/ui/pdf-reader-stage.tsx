import { BookOpen, FileText, FolderOpen, Maximize2, RotateCw, Rows3, Square, X } from "lucide-react";
import type { RefObject } from "react";
import type { ReaderState } from "../document-runtime-adapter";
import type { PdfFitMode, PdfRect, PdfViewMode } from "../pdf-domain";
import { useActivePdfNavigationController } from "../pdf-navigation-controller";
import { LazyPdfPageView, PdfPageView } from "../pdf-reader";
import type { PDFiumDocument } from "../pdfium-renderer";
import { useReaderPaneControllers } from "../workspace-controllers-context";

export type PdfReaderStageViewModel = {
  documentStageRef: RefObject<HTMLDivElement | null>;
  fitMode: PdfFitMode;
  onPdfPageRendered: (page: number) => void;
  pdfStatus: "idle" | "loading" | "error";
  pdfiumDocument: PDFiumDocument | null;
  ready: boolean;
  rotation: number;
  sourceFocus: { documentId: string; page: number; rect: PdfRect } | null;
  sourceZoom: number;
  updateReader: (updater: (reader: ReaderState) => ReaderState) => void;
  viewMode: PdfViewMode;
};

function DemoDocument({ page }: { page: number }) {
  return (
    <article className="document-paper">
      <div className="page-meta"><strong>{page}</strong><em>Diabetes Mellitus: A Clinical Textbook, 5th Edition</em></div>
      <h1>3.4&nbsp;&nbsp; DIABETIC NEUROPATHY</h1>
      <div className="document-columns">
        <section>
          <h2>3.4.1&nbsp;&nbsp; Introduction</h2>
          <p>Diabetic neuropathy is the most common chronic complication of diabetes mellitus and a leading cause of morbidity. It may involve the peripheral and autonomic nervous systems.</p>
          <h2>3.4.3&nbsp;&nbsp; Clinical Features</h2>
          <p>Peripheral neuropathy typically presents with distal symmetrical sensory loss and neuropathic pain.</p>
          <ul><li>Numbness, tingling and burning pain</li><li>Loss of vibration and temperature sensation</li><li>Reduced ankle reflexes</li></ul>
          <div className="figure-card">
            <div className="mechanism-row"><span>Hyperglycemia</span><b>→</b><span>Polyol pathway</span><b>→</b><span>Nerve damage</span></div>
            <div className="nerve-illustration"><i /><i /><i /><i /><i /></div>
            <small>Figure 3.7. Proposed mechanisms in diabetic peripheral neuropathy.</small>
          </div>
        </section>
        <section>
          <h2>3.4.2&nbsp;&nbsp; Pathophysiology</h2>
          <p>The pathogenesis is multifactorial, involving metabolic, vascular and neurotrophic mechanisms.</p>
          <ul><li>Chronic hyperglycemia → polyol pathway activation</li><li>Advanced glycation end products (AGEs)</li><li>Oxidative stress and inflammation</li><li>Microvascular ischemia</li><li>Neurotrophic factor deficiency</li></ul>
          <h2>3.4.4&nbsp;&nbsp; Diagnosis</h2>
          <p>Diagnosis is primarily clinical and based on history and physical examination.</p>
          <ul><li>10-g monofilament test</li><li>Vibration perception (128-Hz tuning fork)</li><li>Nerve conduction studies when needed</li></ul>
          <h2>3.4.5&nbsp;&nbsp; Management</h2>
          <ul><li>Optimal glycemic control</li><li>Pain management</li><li>Foot care and ulcer prevention</li></ul>
        </section>
      </div>
    </article>
  );
}

export function PdfReaderStage({ viewModel }: { viewModel: PdfReaderStageViewModel }) {
  const { documentStageRef, fitMode, onPdfPageRendered, pdfStatus, pdfiumDocument, ready, rotation, sourceFocus, sourceZoom, updateReader, viewMode } = viewModel;
  const { documents, layout, readerInteraction } = useReaderPaneControllers();
  const { INK_COLORS, commitPdfPageAnnotations, handleCrop, handlePdfSelection, handlePdfWheelZoom, handleReaderScroll, inkColor, inkWidth, pdfAnnotationText, pdfAnnotations, pdfHighlightColor, pdfPanel, pdfPanelColor, pdfSignatureDraft, pdfStampDraft, pdfTextDraft, pdfTool, setInkWidth, setPdfPanel, setPdfSignatureDraft, setPdfStampDraft, setPdfTextDraft, updatePdfPanelColor } = readerInteraction;
  const { activeDocument, activeQuery: activeSearchQuery, activeWorkspace, currentDocument: currentPdfDocument, sourcePage, sourcePages } = useActivePdfNavigationController();
  return (<>{pdfPanel === "view" && (
            <div className="floating-tool-panel pdf-view-panel" role="dialog" aria-label="Tùy chọn hiển thị PDF">
              <div className="tool-panel-heading"><div><strong>Hiển thị PDF</strong><span>Thu phóng và bố cục trang</span></div><button className="icon-button compact" onClick={() => setPdfPanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <div className="option-tile-grid">
                <button className={fitMode === "width" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, fitMode: "width", zoom: 1 }))}><Rows3 size={18} /><span>Vừa chiều rộng</span></button>
                <button className={fitMode === "page" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, fitMode: "page", zoom: 1 }))}><Square size={18} /><span>Vừa toàn trang</span></button>
                <button onClick={() => updateReader((reader) => ({ ...reader, rotation: (reader.rotation + 90) % 360 }))}><RotateCw size={18} /><span>Xoay 90°</span></button>
                <button className={viewMode === "continuous" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, viewMode: reader.viewMode === "single" ? "continuous" : "single", fitMode: reader.viewMode === "single" ? "width" : "page", zoom: 1 }))}>{viewMode === "single" ? <Rows3 size={18} /> : <Square size={18} />}<span>{viewMode === "single" ? "Cuộn liên tục" : "Từng trang"}</span></button>
                <button className={layout.workspaceMode === "reader" ? "selected" : ""} onClick={() => layout.changeWorkspaceMode(layout.workspaceMode === "reader" ? "split" : "reader")}><Maximize2 size={18} /><span>{layout.workspaceMode === "reader" ? "Trở lại cả hai" : "Chỉ Reader"}</span></button>
              </div>
            </div>
          )}{pdfPanel === "ink" && (
            <div className="floating-tool-panel pdf-ink-panel" role="dialog" aria-label="Cài đặt công cụ PDF">
              <div className="tool-panel-heading"><div><strong>{pdfTool === "pen" ? "Bút viết PDF" : pdfTool === "area-highlight" ? "Tô vùng" : pdfTool === "note" ? "Ghi chú dán" : pdfTool === "text" ? "Chèn chữ" : pdfTool === "stamp" ? "Đóng dấu" : pdfTool === "signature" ? "Chữ ký" : ["rectangle", "ellipse", "arrow"].includes(pdfTool) ? "Hình vẽ" : "Đánh dấu văn bản"}</strong><span>{pdfTool === "area-highlight" ? "Kéo khung lên công thức, hình, bảng hoặc trang scan" : ["note", "text", "stamp", "signature"].includes(pdfTool) ? "Nhập nội dung rồi bấm vị trí muốn đặt" : ["rectangle", "ellipse", "arrow"].includes(pdfTool) ? "Kéo trực tiếp trên trang để vẽ" : "Chọn màu không làm đổi công cụ"}</span></div><button className="icon-button compact" onClick={() => setPdfPanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              {(pdfTool === "note" || pdfTool === "text") && <label className="pdf-annotation-input"><span>Nội dung</span><textarea value={pdfTextDraft} onChange={(event) => setPdfTextDraft(event.target.value)} rows={3} placeholder="Nhập ghi chú…" /></label>}
              {pdfTool === "stamp" && <>
                <div className="panel-setting"><label>Mẫu dấu</label><div className="stamp-presets">{["ĐÃ XEM", "ĐÃ DUYỆT", "BẢN NHÁP", "QUAN TRỌNG"].map((stamp) => <button key={stamp} className={pdfStampDraft === stamp ? "selected" : ""} onClick={() => setPdfStampDraft(stamp)}>{stamp}</button>)}</div></div>
                <label className="pdf-annotation-input"><span>Tùy chỉnh</span><input value={pdfStampDraft} onChange={(event) => setPdfStampDraft(event.target.value)} /></label>
              </>}
              {pdfTool === "signature" && <label className="pdf-annotation-input"><span>Chữ ký dạng chữ</span><input value={pdfSignatureDraft} onChange={(event) => setPdfSignatureDraft(event.target.value)} placeholder="Nhập tên ký…" /></label>}
              <div className="panel-setting"><label>Màu</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${pdfPanelColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => updatePdfPanelColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={pdfPanelColor} onChange={(event) => updatePdfPanelColor(event.target.value)} /><span>+</span></label></div></div>
              {(pdfTool === "pen" || ["rectangle", "ellipse", "arrow"].includes(pdfTool)) && <div className="panel-setting"><label>Độ dày</label><div className="width-options">{[1, 2, 3, 5].map((width) => <button key={width} className={inkWidth === width ? "selected" : ""} onClick={() => setInkWidth(width)}><i style={{ height: width }} />{width}</button>)}</div></div>}
              {["note", "text", "stamp", "signature"].includes(pdfTool) && <p className="pdf-placement-help">Bấm nhiều vị trí để đặt lại cùng nội dung. Dùng công cụ Tẩy hoặc danh sách Chú thích để xóa.</p>}
            </div>
          )}<div className={`document-stage workspace-frame pdf-view-${viewMode}`} ref={documentStageRef} onScroll={handleReaderScroll} onWheel={handlePdfWheelZoom}>
            {currentPdfDocument && viewMode === "single" ? <PdfPageView key={`${activeDocument?.id}-${sourcePage}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={sourcePage} zoom={sourceZoom} fitMode={fitMode} rotation={rotation} tool={pdfTool} inkColor={inkColor} highlightColor={pdfHighlightColor} inkWidth={inkWidth} annotationText={pdfAnnotationText} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus && sourceFocus.documentId === activeDocument?.id && sourceFocus.page === sourcePage ? sourceFocus.rect : null} onSelection={handlePdfSelection} onAnnotationCommit={(next, previous) => commitPdfPageAnnotations(sourcePage, next, previous)} onCrop={handleCrop} onBitmapReady={onPdfPageRendered} /> : currentPdfDocument ? (
              <div className="continuous-pages">
                {sourcePages.map((page) => <LazyPdfPageView key={`${activeDocument?.id}-${page}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={page} zoom={sourceZoom} fitMode="width" rotation={rotation} tool={pdfTool} inkColor={inkColor} highlightColor={pdfHighlightColor} inkWidth={inkWidth} annotationText={pdfAnnotationText} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus && sourceFocus.documentId === activeDocument?.id && sourceFocus.page === page ? sourceFocus.rect : null} onSelection={handlePdfSelection} onAnnotationCommit={(next, previous) => commitPdfPageAnnotations(page, next, previous)} onCrop={handleCrop} onBitmapReady={onPdfPageRendered} />)}
              </div>
            ) : activeDocument ? (
              <div className="empty-document"><FileText size={34} /><strong>{pdfStatus === "error" ? "Không tìm thấy bản PDF đã lưu" : "Đang mở tài liệu…"}</strong>{pdfStatus === "error" && <button className="primary-button" disabled={!ready} onClick={documents.openLibraryPdfPicker}>Chọn lại PDF</button>}</div>
            ) : activeWorkspace.kind === "demo" ? <><div className="demo-reader-hint"><BookOpen size={16} /><span>Đây là tài liệu minh họa. Thêm một PDF để dùng chọn chữ, chú thích và cắt hình.</span></div><DemoDocument page={sourcePage} /></> : (
              <div className="empty-document"><FolderOpen size={34} /><strong>Chưa có tài liệu</strong><span>Mở PDF để đọc tạm, hoặc lưu riêng vào thư viện khi cần.</span><button className="primary-button" disabled={!ready} onClick={documents.openPreviewPdfPicker}>Mở PDF</button></div>
            )}
          </div></>);
}
