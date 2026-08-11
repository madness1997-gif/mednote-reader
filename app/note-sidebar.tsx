import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FilePlus2,
  FolderPlus,
  MoveRight,
  NotebookTabs,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { requestSelect, requestText } from "./mednote-dialog";
import { NoteNavigation } from "./note-navigation";
import { noteStore, type NoteStore, useNoteStoreSnapshot } from "./note-store";
import { ordered, type NoteStructure } from "./note-domain";
import "./note-sidebar.css";

type NoteSidebarProps = {
  store?: NoteStore;
  onRequestClose?: () => void;
};

function siblingCount(structure: NoteStructure, pageId: string) {
  return structure.sheets.filter((sheet) => sheet.pageId === pageId).length;
}

function sectionColor(id: string) {
  const colors = ["#2b88d8", "#00a36c", "#8764b8", "#d83b01", "#c239b3", "#038387", "#ca5010", "#498205"];
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function textError(error: unknown) {
  return error instanceof Error ? error.message : "Không thể cập nhật ghi chú";
}

export function NoteSidebar({ store = noteStore, onRequestClose }: NoteSidebarProps) {
  const state = useNoteStoreSnapshot(store);
  const structure = state.structure;
  const navigation = useMemo(() => new NoteNavigation(store), [store]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);

  const run = (operation: () => Promise<unknown>) => {
    setLocalError(null);
    void operation().catch((error) => setLocalError(textError(error)));
  };

  useEffect(() => {
    const pageId = structure?.active.activePageId;
    if (!pageId) return;
    setExpandedPages((current) => current.has(pageId) ? current : new Set([...current, pageId]));
  }, [structure?.active.activePageId]);

  if (state.status === "idle" || state.status === "loading" || !structure) {
    return <div className="note-sidebar-v6 note-sidebar-v6-status" data-testid="note-sidebar-v6" role="status">Đang mở cấu trúc note…</div>;
  }

  if (state.status === "error") {
    return <div className="note-sidebar-v6 note-sidebar-v6-status error" data-testid="note-sidebar-v6"><strong>Không thể mở note</strong><span>{state.error}</span></div>;
  }

  const active = structure.active;
  const notebooks = ordered(structure.notebooks);
  const activeNotebook = notebooks.find((record) => record.id === active.activeNotebookId) || notebooks[0];
  const sections = activeNotebook ? ordered(structure.sections.filter((record) => record.notebookId === activeNotebook.id)) : [];
  const activeSection = sections.find((record) => record.id === active.activeSectionId) || sections[0];
  const pages = activeSection ? ordered(structure.pages.filter((record) => record.sectionId === activeSection.id)) : [];
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visiblePages = normalizedQuery
    ? pages.filter((page) => page.title.toLocaleLowerCase("vi").includes(normalizedQuery)
      || ordered(structure.sheets.filter((sheet) => sheet.pageId === page.id)).some((sheet) => `tờ ${sheet.order + 1}`.includes(normalizedQuery)))
    : pages;

  const createNotebook = async () => {
    const title = await requestText({ title: "Tạo Notebook", label: "Tên Notebook", value: "Notebook mới", confirmLabel: "Tạo" });
    if (title) await store.createNotebook(title);
  };

  const renameActiveNotebook = async () => {
    if (!activeNotebook) return;
    const title = await requestText({ title: "Đổi tên Notebook", label: "Tên Notebook", value: activeNotebook.title });
    if (title) await store.renameNotebook(activeNotebook.id, title);
  };

  const deleteActiveNotebook = async () => {
    if (!activeNotebook || !window.confirm(`Xóa Notebook “${activeNotebook.title}”? PDF liên quan vẫn được giữ.`)) return;
    await store.deleteNotebook(activeNotebook.id);
  };

  const createSection = async () => {
    if (!activeNotebook) return;
    const title = await requestText({ title: "Thêm Section", label: "Tên Section", value: "Section mới", confirmLabel: "Thêm" });
    if (!title) return;
    const section = await store.createSection(activeNotebook.id, title);
    await store.createPage(section.id, "Page mới");
  };

  const renameSection = async (id: string, currentTitle: string) => {
    const title = await requestText({ title: "Đổi tên Section", label: "Tên Section", value: currentTitle });
    if (title) await store.renameSection(id, title);
  };

  const deleteSection = async (id: string) => {
    if (sections.length <= 1) return void window.alert("Notebook phải còn ít nhất một Section.");
    const count = structure.pages.filter((page) => page.sectionId === id).length;
    if (window.confirm(`Xóa Section và ${count} Page bên trong?`)) await store.deleteSection(id);
  };

  const createPage = async () => {
    if (!activeSection) return;
    const title = await requestText({ title: "Thêm Page", label: "Tên Page", value: "Page mới", confirmLabel: "Thêm" });
    if (title) await store.createPage(activeSection.id, title);
  };

  const renamePage = async (id: string, currentTitle: string) => {
    const title = await requestText({ title: "Đổi tên Page", label: "Tên Page", value: currentTitle });
    if (title) await store.renamePage(id, title);
  };

  const movePage = async (id: string) => {
    if (!activeSection) return;
    const options = sections.filter((section) => section.id !== activeSection.id);
    if (!options.length) return void window.alert("Notebook chưa có Section khác.");
    const sectionId = await requestSelect({
      title: "Chuyển Page",
      label: "Section đích",
      value: options[0].id,
      options: options.map((section) => ({ value: section.id, label: section.title })),
      confirmLabel: "Chuyển",
    });
    if (sectionId) await store.movePage(id, sectionId, structure.pages.filter((page) => page.sectionId === sectionId).length);
  };

  const deletePage = async (id: string, title: string) => {
    const count = siblingCount(structure, id);
    if (window.confirm(`Xóa Page “${title}” và toàn bộ ${count} tờ bên trong?`)) await store.deletePage(id);
  };

  const deleteSheet = async (pageId: string, sheetId: string) => {
    const count = siblingCount(structure, pageId);
    if (count === 1) {
      if (window.confirm("Đây là tờ cuối cùng. Xóa tờ này sẽ xóa cả Page. Tiếp tục?")) await store.deletePage(pageId);
      return;
    }
    if (window.confirm("Xóa tờ này? Nội dung của tờ sẽ bị xóa.")) await store.deleteSheet(sheetId);
  };

  return (
    <aside className="note-sidebar-v6" data-testid="note-sidebar-v6" aria-label="Điều hướng ghi chú v6">
      <header className="note-sidebar-bookbar">
        <span className="note-sidebar-bookmark"><NotebookTabs size={16} /></span>
        <select
          value={activeNotebook?.id || ""}
          onChange={(event) => run(() => navigation.openNotebook(event.target.value))}
          aria-label="Notebook"
        >
          {notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.title}</option>)}
        </select>
        <button type="button" onClick={() => run(createNotebook)} title="Tạo Notebook" aria-label="Tạo Notebook"><Plus size={16} /></button>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} title="Thao tác Notebook" aria-label="Thao tác Notebook" aria-expanded={menuOpen}><Ellipsis size={17} /></button>
        <button type="button" className="note-sidebar-collapse-button" onClick={onRequestClose} title="Ẩn thanh điều hướng Note" aria-label="Ẩn thanh điều hướng Note"><span>Ẩn</span><ChevronRight size={17} /></button>
        {menuOpen && <div className="note-sidebar-menu">
          <button type="button" onClick={() => { setMenuOpen(false); run(renameActiveNotebook); }}><Pencil size={14} />Đổi tên Notebook</button>
          <button type="button" className="danger" onClick={() => { setMenuOpen(false); run(deleteActiveNotebook); }}><Trash2 size={14} />Xóa Notebook</button>
        </div>}
      </header>

      <label className="note-sidebar-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm Page hoặc tờ…" aria-label="Tìm ghi chú" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={13} /></button>}</label>

      <div className="note-sidebar-columns">
        <section className="note-sidebar-sections" aria-label="Sections">
          <div className="note-sidebar-pane-title"><strong>Section</strong><button type="button" onClick={() => run(createSection)} title="Thêm Section" aria-label="Thêm Section"><FolderPlus size={14} /></button></div>
          <div className="note-sidebar-section-list">
            {sections.map((section) => {
              const selected = section.id === activeSection?.id;
              const count = structure.pages.filter((page) => page.sectionId === section.id).length;
              return <div className={`note-sidebar-section ${selected ? "active" : ""}`} key={section.id} style={{ "--section-color": sectionColor(section.id) } as React.CSSProperties}>
                <button type="button" className="note-sidebar-section-open" onClick={() => run(() => navigation.openSection(section.id))}><strong>{section.title}</strong><small>{count} Page</small></button>
                <span className="note-sidebar-row-actions"><button type="button" onClick={() => run(() => renameSection(section.id, section.title))} title="Đổi tên Section" aria-label={`Đổi tên ${section.title}`}><Pencil size={12} /></button><button type="button" onClick={() => run(() => deleteSection(section.id))} title="Xóa Section" aria-label={`Xóa ${section.title}`}><Trash2 size={12} /></button></span>
              </div>;
            })}
          </div>
        </section>

        <section className="note-sidebar-pages" aria-label="Pages và Sheets">
          <div className="note-sidebar-pane-title" style={{ borderTopColor: sectionColor(activeSection?.id || "") }}><strong>{activeSection?.title || "Page"}</strong><button type="button" onClick={() => run(createPage)} title="Thêm Page" aria-label="Thêm Page"><FilePlus2 size={14} /> Page</button></div>
          <div className="note-sidebar-page-list">
            {visiblePages.map((page) => {
              const sheets = ordered(structure.sheets.filter((sheet) => sheet.pageId === page.id));
              const activePage = page.id === active.activePageId;
              const expanded = expandedPages.has(page.id) || activePage || Boolean(normalizedQuery);
              return <article className={`note-sidebar-page ${activePage ? "active" : ""}`} key={page.id}>
                <div className="note-sidebar-page-head">
                  <button type="button" className="note-sidebar-expand" onClick={() => setExpandedPages((current) => {
                    const next = new Set(current);
                    if (next.has(page.id)) next.delete(page.id); else next.add(page.id);
                    return next;
                  })} aria-label={expanded ? "Thu gọn Page" : "Mở rộng Page"}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  <button type="button" className="note-sidebar-page-open" onClick={() => run(() => navigation.openPage(page.id))}><strong>{page.title}</strong><small>{sheets.length} tờ</small></button>
                  <span className="note-sidebar-row-actions">
                    <button type="button" onClick={() => run(() => store.createSheet(page.id))} title="Thêm tờ" aria-label={`Thêm tờ vào ${page.title}`}><Plus size={12} /></button>
                    <button type="button" onClick={() => run(() => movePage(page.id))} title="Chuyển Section" aria-label={`Chuyển ${page.title}`}><MoveRight size={12} /></button>
                    <button type="button" onClick={() => run(() => renamePage(page.id, page.title))} title="Đổi tên Page" aria-label={`Đổi tên ${page.title}`}><Pencil size={12} /></button>
                    <button type="button" onClick={() => run(() => deletePage(page.id, page.title))} title="Xóa Page" aria-label={`Xóa ${page.title}`}><Trash2 size={12} /></button>
                  </span>
                </div>
                {expanded && <div className="note-sidebar-sheets">
                  {sheets.map((sheet) => <div className={`note-sidebar-sheet ${sheet.id === active.activeSheetId ? "active" : ""}`} key={sheet.id}>
                    <button type="button" className="note-sidebar-sheet-open" onClick={() => run(() => navigation.openSheet(sheet.id))}><BookOpen size={12} /><span>Tờ {sheet.order + 1}</span></button>
                    <span className="note-sidebar-row-actions"><button type="button" onClick={() => run(() => store.moveSheet(sheet.id, page.id, Math.max(0, sheet.order - 1)))} disabled={sheet.order === 0} title="Đưa lên" aria-label="Đưa tờ lên">↑</button><button type="button" onClick={() => run(() => store.moveSheet(sheet.id, page.id, Math.min(sheets.length - 1, sheet.order + 1)))} disabled={sheet.order === sheets.length - 1} title="Đưa xuống" aria-label="Đưa tờ xuống">↓</button><button type="button" onClick={() => run(() => deleteSheet(page.id, sheet.id))} title="Xóa tờ" aria-label={`Xóa tờ ${sheet.order + 1}`}><Trash2 size={11} /></button></span>
                  </div>)}
                </div>}
              </article>;
            })}
            {!visiblePages.length && <div className="note-sidebar-empty">{normalizedQuery ? "Không tìm thấy Page phù hợp." : "Section chưa có Page."}</div>}
          </div>
        </section>
      </div>

      {(localError || state.error) && <div className="note-sidebar-error" role="alert">{localError || state.error}</div>}
      {state.busy && <div className="note-sidebar-busy" role="status">{state.hydratingSheetId ? "Đang mở tờ…" : "Đang lưu…"}</div>}
    </aside>
  );
}

export default NoteSidebar;
