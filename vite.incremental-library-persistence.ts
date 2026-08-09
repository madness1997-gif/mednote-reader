import type { Plugin } from "vite";

const IMPORT_ANCHOR = 'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";';
const IMPORT_LINE = 'import { loadIncrementalLibrary, loadIncrementalPage, materializeIncrementalLibrary, materializeIncrementalPages, primeIncrementalLibraryCache, saveIncrementalLibrary } from "./incremental-library-store";';
const RESTORE_ANCHOR = '    const restore = async () => {\n      try {\n        const stored = localStorage.getItem(STORAGE_KEY);';
const RESTORE_REPLACEMENT = `    const restore = async () => {\n      try {\n        const indexed = await loadIncrementalLibrary() as PersistedLibrary | null;\n        let localCandidate: PersistedLibrary | null = null;\n        try {\n          const raw = localStorage.getItem(STORAGE_KEY);\n          if (raw) {\n            const parsed = JSON.parse(raw) as PersistedLibrary;\n            if (parsed?.workspaces?.length) localCandidate = parsed;\n          }\n        } catch { /* IndexedDB remains authoritative when the local marker is not a full snapshot */ }\n\n        const indexedSavedAt = indexed?.savedAt ?? 0;\n        const localSavedAt = localCandidate?.savedAt ?? 0;\n        const preferred = localCandidate && (!indexed || localSavedAt > indexedSavedAt) ? localCandidate : indexed;\n        if (preferred?.workspaces?.length && !cancelled) {\n          const normalized = preferred.workspaces.filter((workspace) => workspace.kind !== "temporary").map(normalizeWorkspace);\n          let restored = { ...preferred, workspaces: normalized } satisfies PersistedLibrary;\n          if (preferred === localCandidate) {\n            // A relation/sidebar action can intentionally leave a newer full\n            // snapshot in localStorage before reloading. Persist that snapshot\n            // first, then immediately read it back through the v4 loader so the\n            // same startup still receives lightweight lazy page shells.\n            if (indexed) primeIncrementalLibraryCache(indexed as any);\n            await saveIncrementalLibrary(restored as any);\n            const compact = await loadIncrementalLibrary() as PersistedLibrary | null;\n            if (compact?.workspaces?.length) {\n              restored = { ...compact, workspaces: compact.workspaces.map(normalizeWorkspace) } satisfies PersistedLibrary;\n            }\n          }\n          primeIncrementalLibraryCache(restored as any);\n          setWorkspaces(restored.workspaces);\n          setActiveWorkspaceId(restored.activeWorkspaceId || restored.workspaces[0].id);\n          setReaderShare(restored.readerShare || 50);\n          setWorkspaceMode(restored.workspaceMode === "reader" || restored.workspaceMode === "note" ? restored.workspaceMode : "split");\n          setNoteZoom(Math.max(.5, Math.min(2, restored.noteZoom || 1)));\n          localSavedAtRef.current = restored.savedAt || Date.now();\n          setReady(true);\n          return;\n        }\n      } catch { /* fall back to the previous localStorage snapshot */ }\n\n      try {\n        const stored = localStorage.getItem(STORAGE_KEY);`;
const OLD_SAVE_EFFECT = `  useEffect(() => {\n    if (!ready) return;\n    try {\n      const savedAt = Date.now();\n      localSavedAtRef.current = savedAt;\n      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt } satisfies PersistedLibrary));\n    } catch { /* storage may be unavailable in private browsing */ }\n  }, [workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, ready]);`;
const NEW_SAVE_EFFECT = `  useEffect(() => {\n    if (!ready) return;\n    const savedAt = Date.now();\n    localSavedAtRef.current = savedAt;\n    const savedWorkspaces = workspaces.filter((workspace) => workspace.kind !== "temporary");\n    const persistedActiveWorkspaceId = savedWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)\n      ? activeWorkspaceId\n      : savedWorkspaces[0]?.id || activeWorkspaceId;\n    const snapshot = { workspaces: savedWorkspaces, activeWorkspaceId: persistedActiveWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt } satisfies PersistedLibrary;\n\n    // IndexedDB v5 persists normalized Notebook/Section/Page/Sheet records and\n    // keeps full note bodies/strokes/excerpts in Sheet.content. Publish the\n    // React-owned state so the OneNote/sidebar runtimes operate on the same\n    // workspace without forcing every Sheet to hydrate into memory.\n    (window as Window & { __MEDNOTE_LIVE_STATE__?: PersistedLibrary }).__MEDNOTE_LIVE_STATE__ = snapshot;\n    window.dispatchEvent(new CustomEvent("mednote-live-state-changed"));\n\n    const timer = window.setTimeout(() => {\n      void saveIncrementalLibrary(snapshot as any).then(() => {\n        try {\n          localStorage.setItem(STORAGE_KEY, JSON.stringify({ storage: "indexeddb-v5", savedAt }));\n        } catch { /* the IndexedDB save already succeeded */ }\n      }).catch(() => {\n        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* no local persistence available */ }\n      });\n    }, 260);\n    return () => window.clearTimeout(timer);\n  }, [workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, ready]);`;

const SYNCHRONIZED_SAVE_EFFECT = NEW_SAVE_EFFECT
  .replace(
    '    const savedWorkspaces = workspaces.filter((workspace) => workspace.kind !== "temporary");\n    const persistedActiveWorkspaceId',
    '    const savedWorkspaces = workspaces.filter((workspace) => workspace.kind !== "temporary" && workspace.id !== RELATION_META_WORKSPACE_ID);\n    const activeTemporary = workspaces.find((workspace) => workspace.id === activeWorkspaceId && workspace.kind === "temporary");\n    const mirroredNotebookId = activeTemporary?.notebooks.find((notebook) => !isReaderPlaceholder(notebook))?.id;\n    const persistedActiveWorkspaceId',
  )
  .replace(
    '      : savedWorkspaces[0]?.id || activeWorkspaceId;',
    '      : savedWorkspaces.find((workspace) => mirroredNotebookId && workspace.notebooks.some((notebook) => notebook.id === mirroredNotebookId))?.id\n        || savedWorkspaces[0]?.id\n        || "";',
  )
  .replace(
    '(window as Window & { __MEDNOTE_LIVE_STATE__?: PersistedLibrary }).__MEDNOTE_LIVE_STATE__ = snapshot;\n    window.dispatchEvent(new CustomEvent("mednote-live-state-changed"));',
    '(window as Window & { __MEDNOTE_LIVE_STATE__?: PersistedLibrary }).__MEDNOTE_LIVE_STATE__ = JSON.parse(JSON.stringify(snapshot)) as PersistedLibrary;\n    window.dispatchEvent(new CustomEvent("mednote-live-state-changed", { detail: { origin: "react" } }));',
  )
  .replace(
    '    const snapshot = { workspaces: savedWorkspaces, activeWorkspaceId: persistedActiveWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt } satisfies PersistedLibrary;',
    '    const persistentWorkspaceMode: WorkspaceMode = activeTemporary && mirroredNotebookId ? "note" : workspaceMode;\n    const snapshot = { workspaces: savedWorkspaces, activeWorkspaceId: persistedActiveWorkspaceId, readerShare, workspaceMode: persistentWorkspaceMode, noteZoom, savedAt } satisfies PersistedLibrary;',
  )
  .replace(
    '          localStorage.setItem(STORAGE_KEY, JSON.stringify({ storage: "indexeddb-v5", savedAt }));',
    '          const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");\n          // A newer sidebar action may have published a full recovery snapshot\n          // while this older IndexedDB write was queued. Preserve the newer copy.\n          if (Number(current?.savedAt || 0) > savedAt) return;\n          localStorage.setItem(STORAGE_KEY, JSON.stringify({ storage: "indexeddb-v5", savedAt }));',
  );

const SAVE_EFFECT_START = "  // MEDNOTE_AUTOSAVE_EFFECT_START\n";
const SAVE_EFFECT_END = "  // MEDNOTE_AUTOSAVE_EFFECT_END";

const RELATION_READ_ANCHOR = `export function readAppState(): AppState | null {\n  const value = readJson<AppState | null>(APP_KEY, null);\n  return value && Array.isArray(value.workspaces) ? value : null;\n}`;
const RELATION_READ_REPLACEMENT = `export function readAppState(): AppState | null {\n  // The app's source of truth is IndexedDB. Prefer the currently hydrated React\n  // snapshot so relation/sidebar runtimes can navigate lazy page shells without\n  // forcing the full note library back into localStorage.\n  try {\n    if (typeof window !== "undefined") {\n      const live = (window as Window & { __MEDNOTE_LIVE_STATE__?: AppState }).__MEDNOTE_LIVE_STATE__;\n      if (live && Array.isArray(live.workspaces)) return JSON.parse(JSON.stringify(live)) as AppState;\n    }\n  } catch { /* fall through to legacy persistence */ }\n  const value = readJson<AppState | null>(APP_KEY, null);\n  return value && Array.isArray(value.workspaces) ? value : null;\n}`;
const RELATION_UNTOUCHED_ANCHOR = `export function defaultTemplateIsUntouched(page: AnyObject | undefined) {\n  if (!page || page.strokes?.length || page.excerpts?.length) return false;`;
const RELATION_UNTOUCHED_REPLACEMENT = `export function defaultTemplateIsUntouched(page: AnyObject | undefined) {\n  if (!page || page.__mednoteLazyPage === true || page.strokes?.length || page.excerpts?.length) return false;`;

const NOTE_PAGE_TYPE_ANCHOR = `type NotePage = {\n  id: string;`;
const NOTE_PAGE_TYPE_REPLACEMENT = `type NotePage = {\n  id: string;\n  __mednoteLazyPage?: boolean;`;
const HYDRATION_STATE_ANCHOR = '  const [ready, setReady] = useState(false);';
const HYDRATION_STATE_REPLACEMENT = `${HYDRATION_STATE_ANCHOR}\n  const [hydratingNotePageId, setHydratingNotePageId] = useState<string | null>(null);`;
const ACTIVE_NOTE_ANCHOR = '  const activeNote = notePages.find((page) => page.id === activeNotebook.activePageId) ?? notePages[0];';
const ACTIVE_NOTE_REPLACEMENT = `${ACTIVE_NOTE_ANCHOR}\n  const activeNoteHydrating = activeNote.__mednoteLazyPage === true || hydratingNotePageId === activeNote.id;`;
const HYDRATION_EFFECT_ANCHOR = `  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;\n\n  const activateTextEditor`;
const HYDRATION_EFFECT_REPLACEMENT = `  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;\n\n  useEffect(() => {\n    if (!ready || activeNote.__mednoteLazyPage !== true) return;\n    let cancelled = false;\n    const workspaceId = activeWorkspace.id;\n    const notebookId = activeNotebook.id;\n    const pageId = activeNote.id;\n    setHydratingNotePageId(pageId);\n    void loadIncrementalPage(pageId, activeNote as any).then((stored: any) => {\n      if (cancelled) return;\n      if (!stored) {\n        setToast("Không thể mở nội dung trang note này");\n        return;\n      }\n      const hydrated = normalizePage(stored as NotePage);\n      delete hydrated.__mednoteLazyPage;\n      setWorkspaces((items) => items.map((workspace) => workspace.id !== workspaceId ? workspace : {\n        ...workspace,\n        notebooks: workspace.notebooks.map((notebook) => notebook.id !== notebookId ? notebook : {\n          ...notebook,\n          pages: notebook.pages.map((page) => page.id === pageId ? hydrated : page),\n        }),\n      }));\n    }).catch(() => {\n      if (!cancelled) setToast("Không thể mở nội dung trang note này");\n    }).finally(() => {\n      if (!cancelled) setHydratingNotePageId((current) => current === pageId ? null : current);\n    });\n    return () => { cancelled = true; };\n  }, [activeNote.id, activeNote.__mednoteLazyPage, activeNotebook.id, activeWorkspace.id, ready]);\n\n  const activateTextEditor`;

const UPDATE_ACTIVE_NOTE_ANCHOR = `  const updateActiveNote = (changes: Partial<NotePage>) => {\n    updateActiveNotebook((notebook) => ({`;
const UPDATE_ACTIVE_NOTE_REPLACEMENT = `  const updateActiveNote = (changes: Partial<NotePage>) => {\n    if (activeNote.__mednoteLazyPage === true) {\n      setToast("Đang mở nội dung trang note…");\n      return;\n    }\n    updateActiveNotebook((notebook) => ({`;

const MEANINGFUL_DATA_ANCHOR = '    return workspace.notebooks.some((notebook) => notebook.pages.some((page) => page.body.trim() || page.excerpts.length || page.strokes.length));';
const MEANINGFUL_DATA_REPLACEMENT = '    return workspace.notebooks.some((notebook) => notebook.pages.some((page) => page.__mednoteLazyPage === true || page.body.trim() || page.excerpts.length || page.strokes.length));';

const SYNC_START_ANCHOR = `    if (!silent) setToast("Đang lưu toàn bộ dữ liệu lên Google Drive…");\n    try {\n      const remoteFiles = await listDriveAppFiles(token);`;
const SYNC_START_REPLACEMENT = `    if (!silent) setToast("Đang lưu toàn bộ dữ liệu lên Google Drive…");\n    try {\n      const savedWorkspaces = workspaces.filter((workspace) => workspace.kind !== "temporary");\n      const persistedActiveWorkspaceId = savedWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)\n        ? activeWorkspaceId\n        : savedWorkspaces[0]?.id || activeWorkspaceId;\n      const syncSnapshot = await materializeIncrementalLibrary({ workspaces: savedWorkspaces, activeWorkspaceId: persistedActiveWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt: localSavedAtRef.current || Date.now() } as any) as PersistedLibrary;\n      const syncWorkspaces = syncSnapshot.workspaces;\n      const remoteFiles = await listDriveAppFiles(token);`;
const SYNC_DOCUMENTS_ANCHOR = '      workspaces.forEach((workspace) => workspace.documents.forEach((document) => documents.set(document.id, document)));';
const SYNC_DOCUMENTS_REPLACEMENT = '      syncWorkspaces.forEach((workspace) => workspace.documents.forEach((document) => documents.set(document.id, document)));';
const SYNC_ASSETS_ANCHOR = '      const assetIds = new Set(workspaces.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : [])))));';
const SYNC_ASSETS_REPLACEMENT = '      const assetIds = new Set(syncWorkspaces.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : [])))));';
const SYNC_SNAPSHOT_ANCHOR = '      const snapshot: PersistedLibrary = { workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt };';
const SYNC_SNAPSHOT_REPLACEMENT = '      const snapshot: PersistedLibrary = { ...syncSnapshot, savedAt };';

const EXPORT_NOTEBOOK_ANCHOR = `  const exportNotebook = async () => {\n    setToast("Đang tạo tệp note…");\n    const pagesHtml: string[] = [];\n    for (const [index, page] of activeNotebook.pages.entries()) {`;
const EXPORT_NOTEBOOK_REPLACEMENT = `  const exportNotebook = async () => {\n    setToast("Đang tạo tệp note…");\n    let exportPages: NotePage[];\n    try {\n      exportPages = await materializeIncrementalPages(activeNotebook.pages as any) as NotePage[];\n    } catch {\n      setToast("Không thể nạp đầy đủ các trang note để xuất");\n      return;\n    }\n    const pagesHtml: string[] = [];\n    for (const [index, page] of exportPages.entries()) {`;

const NOTE_STAGE_ANCHOR = '          <div className="note-stage workspace-frame" ref={noteStageRef}>';
const NOTE_STAGE_REPLACEMENT = `          <div className={\`note-stage workspace-frame \${activeNoteHydrating ? "note-stage-hydrating" : ""}\`} ref={noteStageRef} aria-busy={activeNoteHydrating}>\n            {activeNoteHydrating && <div role="status" aria-live="polite" style={{ position: "sticky", top: 12, zIndex: 20, alignSelf: "center", margin: "8px auto -42px", width: "max-content", maxWidth: "calc(100% - 24px)", padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,.94)", boxShadow: "0 4px 18px rgba(27,52,61,.14)", color: "#36515b", fontSize: 13, pointerEvents: "none" }}>Đang mở nội dung trang…</div>}`;
const NOTE_PAPER_STYLE_ANCHOR = 'style={paperStyle} onPointerDown={(event) => {';
const NOTE_PAPER_STYLE_REPLACEMENT = 'style={{ ...paperStyle, pointerEvents: activeNoteHydrating ? "none" : undefined, opacity: activeNoteHydrating ? .72 : 1 }} onPointerDown={(event) => {';

function replaceRequired(code: string, anchor: string, replacement: string, label: string) {
  if (code.includes(replacement)) return code;
  const first = code.indexOf(anchor);
  if (first < 0) throw new Error(`Không tìm thấy ${label} để bật lazy note hydration.`);
  if (code.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`Tìm thấy nhiều ${label}; cần cập nhật lazy note hydration transform.`);
  return code.replace(anchor, replacement);
}

function replaceMarkedBlock(code: string, startMarker: string, endMarker: string, replacement: string, label: string) {
  const start = code.indexOf(startMarker);
  const end = start < 0 ? -1 : code.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Không tìm thấy ${label} để bật lazy note hydration.`);
  return `${code.slice(0, start + startMarker.length)}${replacement}\n${code.slice(end)}`;
}

export function incrementalLibraryPersistencePlugin(): Plugin {
  return {
    name: "mednote-incremental-library-persistence",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];

      if (normalizedId.endsWith("/app/relation-library-shared.ts")) {
        let next = code;
        if (!next.includes("__MEDNOTE_LIVE_STATE__")) next = replaceRequired(next, RELATION_READ_ANCHOR, RELATION_READ_REPLACEMENT, "readAppState của relation runtime");
        next = replaceRequired(next, RELATION_UNTOUCHED_ANCHOR, RELATION_UNTOUCHED_REPLACEMENT, "kiểm tra note mặc định của relation runtime");
        return { code: next, map: null };
      }

      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      if (!next.includes(IMPORT_LINE)) next = replaceRequired(next, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`, "import persistence");
      next = replaceRequired(next, NOTE_PAGE_TYPE_ANCHOR, NOTE_PAGE_TYPE_REPLACEMENT, "kiểu NotePage");
      next = replaceRequired(next, HYDRATION_STATE_ANCHOR, HYDRATION_STATE_REPLACEMENT, "state hydration");
      next = replaceRequired(next, ACTIVE_NOTE_ANCHOR, ACTIVE_NOTE_REPLACEMENT, "active note");
      next = replaceRequired(next, HYDRATION_EFFECT_ANCHOR, HYDRATION_EFFECT_REPLACEMENT, "effect hydrate trang note");
      next = replaceRequired(next, RESTORE_ANCHOR, RESTORE_REPLACEMENT, "luồng restore localStorage");
      next = next.replace("localSavedAt > indexedSavedAt", "localSavedAt >= indexedSavedAt");
      next = next.includes(SAVE_EFFECT_START)
        ? replaceMarkedBlock(next, SAVE_EFFECT_START, SAVE_EFFECT_END, SYNCHRONIZED_SAVE_EFFECT, "autosave đồng bộ")
        : replaceRequired(next, OLD_SAVE_EFFECT, SYNCHRONIZED_SAVE_EFFECT, "autosave localStorage cũ");
      next = replaceRequired(next, UPDATE_ACTIVE_NOTE_ANCHOR, UPDATE_ACTIVE_NOTE_REPLACEMENT, "updateActiveNote");
      next = replaceRequired(next, MEANINGFUL_DATA_ANCHOR, MEANINGFUL_DATA_REPLACEMENT, "kiểm tra dữ liệu cục bộ");
      next = replaceRequired(next, SYNC_START_ANCHOR, SYNC_START_REPLACEMENT, "đầu luồng Drive sync");
      next = replaceRequired(next, SYNC_DOCUMENTS_ANCHOR, SYNC_DOCUMENTS_REPLACEMENT, "danh sách PDF Drive sync");
      next = replaceRequired(next, SYNC_ASSETS_ANCHOR, SYNC_ASSETS_REPLACEMENT, "danh sách asset Drive sync");
      next = replaceRequired(next, SYNC_SNAPSHOT_ANCHOR, SYNC_SNAPSHOT_REPLACEMENT, "manifest Drive sync");
      next = replaceRequired(next, EXPORT_NOTEBOOK_ANCHOR, EXPORT_NOTEBOOK_REPLACEMENT, "xuất notebook");
      next = replaceRequired(next, NOTE_STAGE_ANCHOR, NOTE_STAGE_REPLACEMENT, "note stage");
      next = replaceRequired(next, NOTE_PAPER_STYLE_ANCHOR, NOTE_PAPER_STYLE_REPLACEMENT, "style note paper");
      return { code: next, map: null };
    },
  };
}
