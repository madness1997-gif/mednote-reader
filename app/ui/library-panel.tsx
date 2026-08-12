import { Check, FileText, FolderOpen, NotebookTabs, Pencil, Trash2, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { LibraryProjection } from "../library-projection";
import { notebookIconStyle } from "../notebook-color";
import "../library-panel.css";

export type LibraryPanelProps = {
  activeDocumentContextId: string;
  activeNotebookId: string | null;
  libraryProjection: LibraryProjection;
  ready: boolean;
  onClose: () => void;
  onDeleteDocument: (contextId: string) => void | Promise<unknown>;
  onImportDocuments: () => void;
  onOpenDocument: (contextId: string) => void | Promise<unknown>;
  onOpenNotebook: (notebookId: string) => void | Promise<unknown>;
  onRenameDocument: (contextId: string, name: string) => Promise<void>;
};

function notebookIconStyle(notebookId: string): CSSProperties {
  // FNV-1a keeps the color tied to the durable Notebook ID, so rename/reorder
  // never changes the notebook's visual identity. Using the full HSL space
  // gives us hundreds of visibly distinct combinations instead of a short
  // palette that begins repeating once a library grows large.
  let hash = 0x811c9dc5;
  for (let index = 0; index < notebookId.length; index += 1) {
    hash ^= notebookId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 56 + ((hash >>> 8) % 19);
  const foregroundLightness = 30 + ((hash >>> 16) % 13);
  const backgroundLightness = 92 + ((hash >>> 24) % 5);
  return {
    background: `hsl(${hue} ${Math.max(34, saturation - 16)}% ${backgroundLightness}%)`,
    color: `hsl(${hue} ${saturation}% ${foregroundLightness}%)`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} ${Math.max(28, saturation - 22)}% 84% / .72)`,
  };
}

export function LibraryPanel({
  activeDocumentContextId,
  activeNotebookId,
  libraryProjection,
  ready,
  onClose,
  onDeleteDocument,
  onImportDocuments,
  onOpenDocument,
  onOpenNotebook,
  onRenameDocument,
}: LibraryPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [renamePending, setRenamePending] = useState(false);

  const cancelRename = () => {
    if (renamePending) return;
    setRenamingId(null);
    setRenamingName("");
  };

  const commitRename = async () => {
    if (!renamingId || renamePending) return;
    setRenamePending(true);
    try {
      await onRenameDocument(renamingId, renamingName);
      setRenamingId(null);
      setRenamingName("");
    } catch {
      // The composition root reports the mutation error and the editor remains
      // open so the user can correct the name.
    } finally {
      setRenamePending(false);
    }
  };

  return (
    <div className="library-backdrop" onPointerDown={onClose}>
      <aside className="library-panel" aria-label="Thư viện tài liệu và ghi chú" onPointerDown={(event) => event.stopPropagation()}>
        <div className="library-header">
          <div><strong>Thư viện</strong><span>Tài liệu bên trái, ghi chú bên phải; liên kết giữa chúng vẫn được giữ nguyên</span></div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button>
        </div>
        <button className="library-import" disabled={!ready} onClick={onImportDocuments}>
          <FolderOpen size={18} />
          <span><strong>Lưu PDF hoặc cụm PDF vào thư viện</strong><small>PDF được quản lý độc lập với cấu trúc Notebook / Section / Page</small></span>
        </button>
        <div className="library-list library-two-column">
          <section className="library-domain library-document-domain" aria-label="Tài liệu">
            <div className="library-domain-heading"><div><strong>Tài liệu</strong><span>{libraryProjection.documents.length} mục</span></div><small>DocumentGraph</small></div>
            <div className="library-domain-scroll">
              {libraryProjection.documents.length ? libraryProjection.documents.map((item) => {
                const isRenaming = renamingId === item.id;
                const isActive = item.id === activeDocumentContextId;
                return (
                  <div className="library-row" key={`document:${item.id}`}>
                    {isRenaming ? (
                      <form className={`library-item library-rename-item ${isActive ? "active" : ""}`} onSubmit={(event) => { event.preventDefault(); void commitRename(); }}>
                        <span className="library-icon"><FileText size={19} /></span>
                        <span><input autoFocus disabled={renamePending} value={renamingName} onChange={(event) => setRenamingName(event.target.value)} onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => { if (event.key === "Escape") cancelRename(); }} aria-label="Tên tài liệu mới" /><small>Enter để lưu · Esc để hủy</small></span>
                      </form>
                    ) : (
                      <button className={`library-item ${isActive ? "active" : ""}`} onClick={() => { void onOpenDocument(item.id); }}>
                        <span className="library-icon"><FileText size={19} /></span>
                        <span><strong>{item.name}</strong><small>{item.documentCount > 1 ? `${item.documentCount} tài liệu` : "1 tài liệu"} · {item.linkedNotebookIds.length ? `${item.linkedNotebookIds.length} Notebook liên kết` : "không liên kết Note"}</small></span>
                      </button>
                    )}
                    {isRenaming
                      ? <><button className="library-action library-save" disabled={renamePending} onClick={() => { void commitRename(); }} aria-label="Lưu tên mới" title="Lưu tên mới"><Check size={17} /></button><button className="library-action library-cancel" disabled={renamePending} onClick={cancelRename} aria-label="Hủy đổi tên" title="Hủy"><X size={17} /></button></>
                      : <><button className="library-action library-rename" onClick={() => { setRenamingId(item.id); setRenamingName(item.name); }} aria-label={`Đổi tên ${item.name}`} title="Đổi tên tài liệu"><Pencil size={17} /></button><button className="library-action library-delete" onClick={() => { void onDeleteDocument(item.id); }} aria-label={`Xóa ${item.name}`} title="Xóa PDF; giữ nguyên NoteStructure"><Trash2 size={17} /></button></>}
                  </div>
                );
              }) : <div className="library-domain-empty">Chưa có PDF đã lưu. PDF tạm không xuất hiện ở đây.</div>}
            </div>
          </section>

          <section className="library-domain library-note-domain" aria-label="Ghi chú">
            <div className="library-domain-heading"><div><strong>Ghi chú</strong><span>{libraryProjection.notes.length} Notebook</span></div><small>NoteStructure</small></div>
            <div className="library-domain-scroll">
              {libraryProjection.notes.length ? libraryProjection.notes.map((notebook) => (
                <div className="library-row library-row-single" key={`note:${notebook.id}`}>
                  <button className={`library-item ${activeNotebookId === notebook.id ? "active" : ""}`} onClick={() => { void onOpenNotebook(notebook.id); }}>
                    <span className="library-icon" style={notebookIconStyle(notebook.id)}><NotebookTabs size={19} /></span>
                    <span><strong>{notebook.title}</strong><small>{notebook.sectionCount} section · {notebook.pageCount} page · {notebook.sheetCount} sheet{notebook.linkedDocuments.length ? ` · ${notebook.linkedDocuments.length} PDF liên kết` : " · độc lập"}</small></span>
                  </button>
                </div>
              )) : <div className="library-domain-empty">Chưa có Notebook.</div>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
