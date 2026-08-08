import type { Plugin } from "vite";

const IMPORT_ANCHOR = 'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";';
const IMPORT_LINE = 'import { loadIncrementalLibrary, primeIncrementalLibraryCache, saveIncrementalLibrary } from "./incremental-library-store";';
const RESTORE_ANCHOR = '    const restore = async () => {\n      try {\n        const stored = localStorage.getItem(STORAGE_KEY);';
const RESTORE_REPLACEMENT = `    const restore = async () => {\n      try {\n        const indexed = await loadIncrementalLibrary() as PersistedLibrary | null;\n        if (indexed?.workspaces?.length && !cancelled) {\n          const normalized = indexed.workspaces.map(normalizeWorkspace);\n          const restored = { ...indexed, workspaces: normalized } satisfies PersistedLibrary;\n          primeIncrementalLibraryCache(restored);\n          setWorkspaces(normalized);\n          setActiveWorkspaceId(indexed.activeWorkspaceId || normalized[0].id);\n          setReaderShare(indexed.readerShare || 50);\n          setWorkspaceMode(indexed.workspaceMode === "reader" || indexed.workspaceMode === "note" ? indexed.workspaceMode : "split");\n          setNoteZoom(Math.max(.5, Math.min(2, indexed.noteZoom || 1)));\n          localSavedAtRef.current = indexed.savedAt || Date.now();\n          setReady(true);\n          return;\n        }\n      } catch { /* fall back to the previous localStorage snapshot */ }\n\n      try {\n        const stored = localStorage.getItem(STORAGE_KEY);`;
const OLD_SAVE_EFFECT = `  useEffect(() => {\n    if (!ready) return;\n    try {\n      const savedAt = Date.now();\n      localSavedAtRef.current = savedAt;\n      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt } satisfies PersistedLibrary));\n    } catch { /* storage may be unavailable in private browsing */ }\n  }, [workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, ready]);`;
const NEW_SAVE_EFFECT = `  useEffect(() => {\n    if (!ready) return;\n    const savedAt = Date.now();\n    localSavedAtRef.current = savedAt;\n    const snapshot = { workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, savedAt } satisfies PersistedLibrary;\n\n    // IndexedDB v3 intentionally leaves only a tiny marker in localStorage.\n    // Imperative features such as the OneNote-style sidebar used to read that\n    // legacy localStorage key and therefore saw no workspaces after migration.\n    // Publish the React-owned hydrated state in memory so those runtimes follow\n    // exactly the same workspace/notebook that the visible Note canvas renders.\n    (window as Window & { __MEDNOTE_LIVE_STATE__?: PersistedLibrary }).__MEDNOTE_LIVE_STATE__ = snapshot;\n    window.dispatchEvent(new CustomEvent("mednote-live-state-changed"));\n\n    const timer = window.setTimeout(() => {\n      void saveIncrementalLibrary(snapshot).then(() => {\n        try {\n          localStorage.setItem(STORAGE_KEY, JSON.stringify({ storage: "indexeddb-v3", savedAt }));\n        } catch { /* the IndexedDB save already succeeded */ }\n      }).catch(() => {\n        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* no local persistence available */ }\n      });\n    }, 260);\n    return () => window.clearTimeout(timer);\n  }, [workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, ready]);`;

const RELATION_READ_ANCHOR = `export function readAppState(): AppState | null {\n  const value = readJson<AppState | null>(APP_KEY, null);\n  return value && Array.isArray(value.workspaces) ? value : null;\n}`;
const RELATION_READ_REPLACEMENT = `export function readAppState(): AppState | null {\n  // The app's source of truth is IndexedDB v3. page.tsx publishes the currently\n  // hydrated React snapshot in memory because localStorage now contains only\n  // { storage: \"indexeddb-v3\" }. Prefer that live snapshot so relation/sidebar\n  // runtimes cannot drift away from the Note canvas. Clone it because relation\n  // helpers intentionally mutate working copies.\n  try {\n    if (typeof window !== \"undefined\") {\n      const live = (window as Window & { __MEDNOTE_LIVE_STATE__?: AppState }).__MEDNOTE_LIVE_STATE__;\n      if (live && Array.isArray(live.workspaces)) return JSON.parse(JSON.stringify(live)) as AppState;\n    }\n  } catch { /* fall through to legacy persistence */ }\n  const value = readJson<AppState | null>(APP_KEY, null);\n  return value && Array.isArray(value.workspaces) ? value : null;\n}`;

function replaceRequired(code: string, anchor: string, replacement: string, label: string) {
  const first = code.indexOf(anchor);
  if (first < 0) throw new Error(`Không tìm thấy ${label} để bật IndexedDB incremental persistence.`);
  if (code.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`Tìm thấy nhiều ${label}; cần cập nhật persistence transform.`);
  return code.replace(anchor, replacement);
}

export function incrementalLibraryPersistencePlugin(): Plugin {
  return {
    name: "mednote-incremental-library-persistence",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];

      if (normalizedId.endsWith("/app/relation-library-shared.ts")) {
        const next = replaceRequired(code, RELATION_READ_ANCHOR, RELATION_READ_REPLACEMENT, "readAppState của relation runtime");
        return { code: next, map: null };
      }

      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      if (!next.includes(IMPORT_LINE)) next = replaceRequired(next, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`, "import persistence");
      next = replaceRequired(next, RESTORE_ANCHOR, RESTORE_REPLACEMENT, "luồng restore localStorage");
      next = replaceRequired(next, OLD_SAVE_EFFECT, NEW_SAVE_EFFECT, "autosave localStorage cũ");
      return { code: next, map: null };
    },
  };
}
