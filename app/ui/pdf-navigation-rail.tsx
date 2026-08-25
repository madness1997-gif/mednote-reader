import { Bookmark, BookmarkCheck, ChevronLeft, Highlighter, ListTree, ScanText, Search, Trash2, X } from "lucide-react";
import { pdfAnnotationLabel, pdfAnnotationSummary, useActivePdfNavigationController } from "../pdf-navigation-controller";
import { VirtualPdfThumbnailList } from "../virtualized-thumbnails";

export function PdfNavigationRail() {
  const navigation = useActivePdfNavigationController();
  const {
    activeDocument,
    activeQuery: activeSearchQuery,
    activeWorkspace,
    annotations: pdfAnnotations,
    bookmarks,
    currentDocument: currentPdfDocument,
    goToPage: goToPageFromRail,
    hideRail,
    openSearchResult,
    outline,
    performSearch,
    query: searchQuery,
    railTab: pdfRailTab,
    removeAnnotation: removePdfAnnotation,
    removeBookmark,
    searchResults,
    searchWholeCollection,
    searching,
    setQuery: setSearchQuery,
    setRailTab: setPdfRailTab,
    setSearchWholeCollection,
    sourcePage,
    sourcePages,
  } = navigation;
  return (<><aside className={`pdf-thumbnails pdf-panel-${pdfRailTab}`} aria-label="Điều hướng tài liệu">
          <div className="pdf-rail-tabs">
            <button className={pdfRailTab === "pages" ? "active" : ""} onClick={() => setPdfRailTab("pages")} title="Trang" aria-label="Hình thu nhỏ các trang"><ScanText size={17} /></button>
            <button className={pdfRailTab === "outline" ? "active" : ""} onClick={() => setPdfRailTab("outline")} title="Mục lục" aria-label="Mục lục PDF"><ListTree size={17} /></button>
            <button className={pdfRailTab === "search" ? "active" : ""} onClick={() => setPdfRailTab("search")} title="Tìm kiếm" aria-label="Tìm kiếm"><Search size={17} /></button>
            <button className={pdfRailTab === "marks" ? "active" : ""} onClick={() => setPdfRailTab("marks")} title="Đánh dấu" aria-label="Bookmark và chú thích"><Bookmark size={17} /></button>
            <button onClick={hideRail} title="Thu gọn" aria-label="Thu gọn bảng điều hướng"><ChevronLeft size={17} /></button>
          </div>

          {pdfRailTab === "pages" && (
            <VirtualPdfThumbnailList pages={sourcePages} document={currentPdfDocument} activeDocumentId={activeDocument?.id ?? null} activePage={sourcePage} onPageClick={goToPageFromRail} />
          )}

          {pdfRailTab === "outline" && (
            <div className="pdf-rail-content">
              <h3>Mục lục</h3>
              {outline.length ? outline.map((entry, index) => (
                <button key={`${entry.title}-${index}`} className="outline-entry" style={{ paddingLeft: 10 + Math.min(entry.depth, 4) * 13 }} disabled={!entry.page} onClick={() => entry.page && goToPageFromRail(entry.page)}>
                  <span>{entry.title}</span>{entry.page && <b>{entry.page}</b>}
                </button>
              )) : <div className="rail-empty"><ListTree size={25} /><span>PDF này không có mục lục nhúng.</span></div>}
            </div>
          )}

          {pdfRailTab === "search" && (
            <div className="pdf-rail-content search-panel">
              <h3>Tìm trong tài liệu</h3>
              <form onSubmit={(event) => { event.preventDefault(); void performSearch(); }}>
                <div className="rail-search-box"><Search size={15} /><input id="pdf-search-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nhập từ cần tìm…" /><button type="submit">Tìm</button></div>
                {activeWorkspace.documents.length > 1 && <label className="collection-search"><input type="checkbox" checked={searchWholeCollection} onChange={(event) => setSearchWholeCollection(event.target.checked)} /> Tìm trong cả {activeWorkspace.documents.length} tài liệu</label>}
              </form>
              <div className="search-summary">{searching ? "Đang đọc lớp chữ của PDF…" : activeSearchQuery ? `${searchResults.length} trang có kết quả` : "Ctrl+F để mở nhanh"}</div>
              <div className="search-results">
                {searchResults.map((result, index) => <button key={`${result.documentId}-${result.page}-${index}`} onClick={() => openSearchResult(result)}><span><b>{result.documentName}</b><em>Trang {result.page} · {result.occurrences} kết quả</em></span><p>{result.snippet}</p></button>)}
                {!searching && activeSearchQuery && !searchResults.length && <div className="rail-empty"><Search size={24} /><span>Không tìm thấy “{activeSearchQuery}”. PDF scan cần OCR.</span></div>}
              </div>
            </div>
          )}

          {pdfRailTab === "marks" && (
            <div className="pdf-rail-content marks-panel">
              <h3>Đánh dấu trang</h3>
              {bookmarks.length ? bookmarks.map((page) => <div className="mark-row" key={`bookmark-${page}`}><button onClick={() => goToPageFromRail(page)}><BookmarkCheck size={15} /><span>Trang {page}</span></button><button aria-label={`Bỏ đánh dấu trang ${page}`} onClick={() => removeBookmark(page)}><X size={14} /></button></div>) : <p className="marks-empty">Chưa có trang được đánh dấu.</p>}
              <h3>Chú thích</h3>
              {pdfAnnotations.length ? [...pdfAnnotations].sort((a, b) => a.page - b.page).map((annotation) => <div className="annotation-row" key={annotation.id}><button onClick={() => goToPageFromRail(annotation.page)}><span className={`annotation-kind kind-${annotation.kind}`}>{pdfAnnotationLabel(annotation)}</span><b>Trang {annotation.page}</b><p>{pdfAnnotationSummary(annotation)}</p></button><button className="delete-mark" onClick={() => removePdfAnnotation(annotation.id)} aria-label="Xóa chú thích"><Trash2 size={14} /></button></div>) : <div className="rail-empty"><Highlighter size={24} /><span>Highlight, hình vẽ, ghi chú và nét bút sẽ xuất hiện tại đây.</span></div>}
            </div>
          )}
        </aside></>);
}
