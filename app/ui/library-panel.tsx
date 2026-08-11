// @ts-nocheck
import type React from "react";
type TextLineHeight = any; type PaperTemplate = any; type PdfFitMode = any; type PdfViewMode = any; type PdfTool = any;

export type P9UiScope = Record<string, any>;

export function LibraryPanel({ scope }: { scope: P9UiScope }) {
  const { Check, FileText, FolderOpen, NotebookTabs, Pencil, Trash2, X, activeWorkspace, activeWorkspaceIdRef, beginWorkspaceRename, cancelWorkspaceRename, commitWorkspaceRename, deleteWorkspace, libraryPdfInputRef, libraryProjection, noteState, openLibraryNotebook, ready, renamingWorkspaceId, renamingWorkspaceName, setActiveWorkspaceId, setLibraryOpen, setRenamingWorkspaceName, setToast, setWorkspaceMode, workspaceModeRef, workspaces } = scope;
  return (<><div className="library-backdrop" onPointerDown={() => setLibraryOpen(false)}>
          <aside className="library-panel" aria-label="Thư viện tài liệu" onPointerDown={(event) => event.stopPropagation()}>
            <div className="library-header"><div><strong>Thư viện</strong><span>PDF và note được lưu độc lập; chỉ liên kết khi bạn chọn</span></div><button className="icon-button" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={19} /></button></div>
            <button className="library-import" disabled={!ready} onClick={() => libraryPdfInputRef.current?.click()}><FolderOpen size={18} /><span><strong>Lưu PDF hoặc cụm PDF vào thư viện</strong><small>Chỉ thao tác này mới lưu tệp PDF trên thiết bị</small></span></button>
            <div className="library-list">
              <section className="library-domain" aria-label="Ghi chú">
                <div className="library-domain-heading"><div><strong>Ghi chú</strong><span>{libraryProjection.notes.length} Notebook</span></div><small>Nguồn: NoteStructure</small></div>
                {libraryProjection.notes.length ? libraryProjection.notes.map((notebook) => (
                  <div className="library-row library-row-single" key={`note:${notebook.id}`}>
                    <button className={`library-item ${noteState.structure?.active.activeNotebookId === notebook.id ? "active" : ""}`} onClick={() => { void openLibraryNotebook(notebook.id); }}>
                      <span className="library-icon"><NotebookTabs size={19} /></span>
                      <span><strong>{notebook.title}</strong><small>{notebook.sectionCount} section · {notebook.pageCount} page · {notebook.sheetCount} sheet{notebook.linkedDocuments.length ? ` · ${notebook.linkedDocuments.length} PDF liên kết` : " · độc lập"}</small></span>
                    </button>
                  </div>
                )) : <div className="library-domain-empty">Chưa có Notebook.</div>}
              </section>

              <section className="library-domain" aria-label="Tài liệu">
                <div className="library-domain-heading"><div><strong>Tài liệu</strong><span>{libraryProjection.documents.length} mục</span></div><small>Nguồn: DocumentGraph</small></div>
                {libraryProjection.documents.length ? libraryProjection.documents.map((item) => {
                  const workspace = workspaces.find((candidate) => candidate.id === item.id);
                  const isRenaming = renamingWorkspaceId === item.id;
                  return (
                    <div className="library-row" key={`document:${item.id}`}>
                      {isRenaming && workspace ? (
                        <form className={`library-item library-rename-item ${item.id === activeWorkspace.id ? "active" : ""}`} onSubmit={(event) => { event.preventDefault(); commitWorkspaceRename(item.id); }}>
                          <span className="library-icon"><FileText size={19} /></span>
                          <span><input autoFocus value={renamingWorkspaceName} onChange={(event) => setRenamingWorkspaceName(event.target.value)} onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => { if (event.key === "Escape") cancelWorkspaceRename(); }} aria-label="Tên tài liệu mới" /><small>Enter để lưu · Esc để hủy</small></span>
                        </form>
                      ) : (
                        <button className={`library-item ${item.id === activeWorkspace.id ? "active" : ""}`} disabled={!workspace} onClick={() => {
                          if (!workspace) return setToast("Document runtime chưa sẵn sàng");
                          void (async () => {
                            const currentNotebookId = noteState.structure?.active.activeNotebookId || null;
                            const linkedNotebookId = currentNotebookId && item.linkedNotebookIds.includes(currentNotebookId)
                              ? currentNotebookId
                              : item.linkedNotebookIds[0] || null;
                            if (linkedNotebookId) await openLibraryNotebook(linkedNotebookId);
                            activeWorkspaceIdRef.current = item.id;
                            setActiveWorkspaceId(item.id);
                            workspaceModeRef.current = "reader";
                            setWorkspaceMode("reader");
                            setLibraryOpen(false);
                          })();
                        }}>
                          <span className="library-icon"><FileText size={19} /></span>
                          <span><strong>{item.name}</strong><small>{item.kind === "collection" ? `${item.documents.length} tài liệu` : "1 tài liệu"} · {item.linkedNotebookIds.length ? `${item.linkedNotebookIds.length} Notebook liên kết` : "không liên kết note"}</small></span>
                        </button>
                      )}
                      {workspace && (isRenaming
                        ? <><button className="library-action library-save" onClick={() => commitWorkspaceRename(item.id)} aria-label="Lưu tên mới" title="Lưu tên mới"><Check size={17} /></button><button className="library-action library-cancel" onClick={cancelWorkspaceRename} aria-label="Hủy đổi tên" title="Hủy"><X size={17} /></button></>
                        : <><button className="library-action library-rename" onClick={() => beginWorkspaceRename(workspace)} aria-label={`Đổi tên ${item.name}`} title="Đổi tên tài liệu"><Pencil size={17} /></button><button className="library-action library-delete" onClick={() => { void deleteWorkspace(item.id); }} aria-label={`Xóa ${item.name}`} title="Xóa PDF; giữ nguyên NoteStructure"><Trash2 size={17} /></button></>)}
                    </div>
                  );
                }) : <div className="library-domain-empty">Chưa có PDF đã lưu. PDF tạm không xuất hiện ở đây.</div>}
              </section>
            </div>
          </aside>
        </div></>);
}
