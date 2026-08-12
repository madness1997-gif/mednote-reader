import {
  BookOpen, ChevronDown, ChevronRight, Ellipsis, FilePlus2, FolderPlus,
  MoveRight, NotebookTabs, Pencil, Plus, Search, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { NoteSidebarController } from "./note-sidebar-controller";
import type { NoteSidebarModel } from "./note-sidebar-model";
import { notebookIconStyle } from "./notebook-color";
import "./note-sidebar.css";

type NoteSidebarProps = {
  status: "idle" | "loading" | "ready" | "error";
  model: NoteSidebarModel | null;
  controller: NoteSidebarController;
  busy: boolean;
  hydratingSheetId: string | null;
  error: string | null;
  onRequestClose?: () => void;
};

function sectionColor(id: string) {
  const colors = ["#2b88d8", "#00a36c", "#8764b8", "#d83b01", "#c239b3", "#038387", "#ca5010", "#498205"];
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function textError(error: unknown) {
  return error instanceof Error ? error.message : "Không thể cập nhật ghi chú";
}

export function NoteSidebar({ status, model, controller, busy, hydratingSheetId, error, onRequestClose }: NoteSidebarProps) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);

  const run = (operation: () => Promise<unknown>) => {
    if (busy) return;
    setLocalError(null);
    void operation().catch((caught) => setLocalError(textError(caught)));
  };

  useEffect(() => {
    const pageId = model?.activePageId;
    if (!pageId) return;
    setExpandedPages((current) => current.has(pageId) ? current : new Set([...current, pageId]));
  }, [model?.activePageId]);

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visiblePages = useMemo(() => {
    if (!model || !normalizedQuery) return model?.pages || [];
    return model.pages.filter((page) => page.title.toLocaleLowerCase("vi").includes(normalizedQuery)
      || page.sheets.some((sheet) => sheet.label.toLocaleLowerCase("vi").includes(normalizedQuery)));
  }, [model, normalizedQuery]);

  if (status === "error") {
    return <div className="note-sidebar note-sidebar-status error" data-testid="note-sidebar"><strong>Không thể mở note</strong><span>{error}</span></div>;
  }
  if (status === "idle" || status === "loading" || !model) {
    return <div className="note-sidebar note-sidebar-status" data-testid="note-sidebar" role="status">Đang mở cấu trúc note…</div>;
  }

  const activeNotebook = model.notebooks.find(({ id }) => id === model.activeNotebookId);
  const activeSection = model.sections.find(({ id }) => id === model.activeSectionId);

  return (
    <div className="note-sidebar" data-testid="note-sidebar" aria-label="Điều hướng ghi chú" aria-busy={busy}>
      <header className="note-sidebar-bookbar">
        <span className="note-sidebar-bookmark" style={notebookIconStyle(model.activeNotebookId)}><NotebookTabs size={16} /></span>
        <select value={model.activeNotebookId} onChange={(event) => run(() => controller.openNotebook(event.target.value))} aria-label="Notebook" disabled={busy}>
          {model.notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.title}</option>)}
        </select>
        <button type="button" onClick={() => run(() => controller.createNotebook())} title="Tạo Notebook" aria-label="Tạo Notebook" disabled={busy}><Plus size={16} /></button>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} title="Thao tác Notebook" aria-label="Thao tác Notebook" aria-expanded={menuOpen} disabled={busy}><Ellipsis size={17} /></button>
        <button type="button" className="note-sidebar-collapse-button" onClick={onRequestClose} title="Ẩn thanh điều hướng Note" aria-label="Ẩn thanh điều hướng Note"><span>Ẩn</span><ChevronRight size={17} /></button>
        {menuOpen && activeNotebook && <div className="note-sidebar-menu">
          <button type="button" onClick={() => { setMenuOpen(false); run(() => controller.renameNotebook(activeNotebook)); }}><Pencil size={14} />Đổi tên Notebook</button>
          <button type="button" className="danger" onClick={() => { setMenuOpen(false); run(() => controller.deleteNotebook(activeNotebook)); }}><Trash2 size={14} />Xóa Notebook</button>
        </div>}
      </header>

      <label className="note-sidebar-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm Page hoặc tờ…" aria-label="Tìm ghi chú" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={13} /></button>}</label>

      <div className="note-sidebar-columns">
        <section className="note-sidebar-sections" aria-label="Sections">
          <div className="note-sidebar-pane-title"><strong>Section</strong><button type="button" onClick={() => activeNotebook && run(() => controller.createSection(activeNotebook))} title="Thêm Section" aria-label="Thêm Section" disabled={busy || !activeNotebook}><FolderPlus size={14} /></button></div>
          <div className="note-sidebar-section-list">
            {model.sections.map((section) => <div className={`note-sidebar-section ${section.active ? "active" : ""}`} key={section.id} style={{ "--section-color": sectionColor(section.id) } as CSSProperties}>
              <button type="button" className="note-sidebar-section-open" onClick={() => run(() => controller.openSection(section.id))} disabled={busy}><strong>{section.title}</strong><small>{section.pages.length} Page</small></button>
              <span className="note-sidebar-row-actions"><button type="button" onClick={() => run(() => controller.renameSection(section))} title="Đổi tên Section" aria-label={`Đổi tên ${section.title}`} disabled={busy}><Pencil size={12} /></button><button type="button" onClick={() => run(() => controller.deleteSection(section, model.sections.length))} title="Xóa Section" aria-label={`Xóa ${section.title}`} disabled={busy}><Trash2 size={12} /></button></span>
            </div>)}
          </div>
        </section>

        <section className="note-sidebar-pages" aria-label="Pages và Sheets">
          <div className="note-sidebar-pane-title" style={{ borderTopColor: sectionColor(model.activeSectionId) }}><strong>{model.activeSectionTitle}</strong><button type="button" onClick={() => activeSection && run(() => controller.createPage(activeSection))} title="Thêm Page" aria-label="Thêm Page" disabled={busy || !activeSection}><FilePlus2 size={14} /> Page</button></div>
          <div className="note-sidebar-page-list">
            {visiblePages.map((page) => {
              const expanded = expandedPages.has(page.id) || page.active || Boolean(normalizedQuery);
              return <article className={`note-sidebar-page ${page.active ? "active" : ""}`} key={page.id}>
                <div className="note-sidebar-page-head">
                  <button type="button" className="note-sidebar-expand" onClick={() => setExpandedPages((current) => { const next = new Set(current); if (next.has(page.id)) next.delete(page.id); else next.add(page.id); return next; })} aria-label={expanded ? "Thu gọn Page" : "Mở rộng Page"}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  <button type="button" className="note-sidebar-page-open" onClick={() => run(() => controller.openPage(page.id))} disabled={busy}><strong>{page.title}</strong><small>{page.sheets.length} tờ</small></button>
                  <span className="note-sidebar-row-actions">
                    <button type="button" onClick={() => run(() => controller.createSheet(page))} title="Thêm tờ" aria-label={`Thêm tờ vào ${page.title}`} disabled={busy}><Plus size={12} /></button>
                    <button type="button" onClick={() => run(() => controller.movePage(page, model.sections))} title="Chuyển Section" aria-label={`Chuyển ${page.title}`} disabled={busy}><MoveRight size={12} /></button>
                    <button type="button" onClick={() => run(() => controller.renamePage(page))} title="Đổi tên Page" aria-label={`Đổi tên ${page.title}`} disabled={busy}><Pencil size={12} /></button>
                    <button type="button" onClick={() => run(() => controller.deletePage(page))} title="Xóa Page" aria-label={`Xóa ${page.title}`} disabled={busy}><Trash2 size={12} /></button>
                  </span>
                </div>
                {expanded && <div className="note-sidebar-sheets">{page.sheets.map((sheet) => <div className={`note-sidebar-sheet ${sheet.active ? "active" : ""}`} key={sheet.id}>
                  <button type="button" className="note-sidebar-sheet-open" onClick={() => run(() => controller.openSheet(sheet.id))} disabled={busy}><BookOpen size={12} /><span>{sheet.label}</span></button>
                  <span className="note-sidebar-row-actions"><button type="button" onClick={() => run(() => controller.moveSheet(sheet, sheet.order - 1))} disabled={busy || sheet.order === 0} title="Đưa lên" aria-label="Đưa tờ lên">↑</button><button type="button" onClick={() => run(() => controller.moveSheet(sheet, sheet.order + 1))} disabled={busy || sheet.order === page.sheets.length - 1} title="Đưa xuống" aria-label="Đưa tờ xuống">↓</button><button type="button" onClick={() => run(() => controller.deleteSheet(page, sheet))} title="Xóa tờ" aria-label={`Xóa tờ ${sheet.order + 1}`} disabled={busy}><Trash2 size={11} /></button></span>
                </div>)}</div>}
              </article>;
            })}
            {!visiblePages.length && <div className="note-sidebar-empty">{normalizedQuery ? "Không tìm thấy Page phù hợp." : "Section chưa có Page."}</div>}
          </div>
        </section>
      </div>

      {(localError || error) && <div className="note-sidebar-error" role="alert">{localError || error}</div>}
      {busy && <div className="note-sidebar-busy" role="status">{hydratingSheetId ? "Đang mở tờ…" : "Đang lưu…"}</div>}
    </div>
  );
}

export default NoteSidebar;
