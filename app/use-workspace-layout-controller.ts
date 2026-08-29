import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { WorkspaceItem, WorkspaceMode } from "./document-runtime-adapter";
import type { PdfRailTab } from "./ui/ui-contracts";

const NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-hidden";
const LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-v6-hidden";

type WorkspacePane = "reader" | "note";

export type UseWorkspaceLayoutControllerOptions = {
  activeWorkspaceKind: WorkspaceItem["kind"];
  hasActiveNote: boolean;
  notify: (message: string) => void;
  onEnterReader: () => void;
  onPrepareWorkspaceModeChange: (mode: WorkspaceMode) => void;
};

export type WorkspaceLayoutController = {
  canShowNote: boolean;
  changeWorkspaceMode: (mode: WorkspaceMode) => void;
  getWorkspaceClassName: (pdfRailVisible: boolean, pdfRailTab: PdfRailTab) => string;
  readerShare: number;
  restoreLayout: (layout: { readerShare: number; workspaceMode: WorkspaceMode }) => void;
  setNoteSidebarVisibility: (visible: boolean) => void;
  setReaderShare: Dispatch<SetStateAction<number>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  showNoteSidebar: boolean;
  startDividerResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  workspaceMode: WorkspaceMode;
  workspaceModeRef: RefObject<WorkspaceMode>;
  workspaceRef: RefObject<HTMLElement | null>;
  workspaceStyle: CSSProperties;
};

export function readerShareForPointer(workspaceLeft: number, workspaceWidth: number, clientX: number) {
  const usableWidth = Math.max(1, workspaceWidth - 236);
  const readerWidth = clientX - workspaceLeft - 108;
  return Math.min(65, Math.max(35, (readerWidth / usableWidth) * 100));
}

export function workspacePaneForElement(element: HTMLElement | null): WorkspacePane | null {
  if (element?.closest(".reader-pane, .pdf-thumbnails")) return "reader";
  if (element?.closest(".notes-pane, .note-navigation-host")) return "note";
  return null;
}

export function useWorkspaceLayoutController(options: UseWorkspaceLayoutControllerOptions): WorkspaceLayoutController {
  const integrationRef = useRef(options);
  integrationRef.current = options;
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceModeRef = useRef<WorkspaceMode>("split");
  const lastWorkspacePaneRef = useRef<WorkspacePane>("reader");
  const lastReaderFocusRef = useRef<HTMLElement | null>(null);
  const lastNoteFocusRef = useRef<HTMLElement | null>(null);
  const pendingWorkspaceFocusRef = useRef<WorkspacePane | null>(null);
  const dividerCleanupRef = useRef<(() => void) | null>(null);
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>("split");
  const [readerShare, setReaderShare] = useState(50);
  const [showNoteSidebar, setShowNoteSidebar] = useState(() => {
    try {
      const preference = localStorage.getItem(NOTE_SIDEBAR_PREFERENCE_KEY);
      return (preference ?? localStorage.getItem(LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY)) !== "1";
    } catch {
      return true;
    }
  });

  const setWorkspaceMode = useCallback<Dispatch<SetStateAction<WorkspaceMode>>>((next) => {
    const value = typeof next === "function" ? next(workspaceModeRef.current) : next;
    workspaceModeRef.current = value;
    setWorkspaceModeState(value);
  }, []);

  const restoreLayout = useCallback((layout: { readerShare: number; workspaceMode: WorkspaceMode }) => {
    setReaderShare(layout.readerShare);
    setWorkspaceMode(layout.workspaceMode);
  }, [setWorkspaceMode]);

  const changeWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    const integration = integrationRef.current;
    if (mode !== "reader" && !integration.hasActiveNote) {
      integration.notify(integration.activeWorkspaceKind === "temporary"
        ? "PDF đang mở tạm. Chọn “Tạo note” để ghi chú mà không cần lưu PDF."
        : "PDF này chưa có note. Chọn “Tạo note” khi bạn muốn ghi chú.");
      return;
    }
    integration.onPrepareWorkspaceModeChange(mode);
    setWorkspaceMode(mode);
    if (mode === "reader") integration.onEnterReader();
    integration.notify(mode === "split" ? "Đang dùng Reader và Note" : mode === "reader" ? "Đang chỉ xem Reader" : "Đang chỉ làm Note");
  }, [setWorkspaceMode]);

  const focusWorkspacePane = useCallback((pane: WorkspacePane) => {
    const paneElement = workspaceRef.current?.querySelector<HTMLElement>(pane === "reader" ? ".reader-pane" : ".notes-pane");
    if (!paneElement || paneElement.getClientRects().length === 0) return;
    const remembered = pane === "reader" ? lastReaderFocusRef.current : lastNoteFocusRef.current;
    const target = remembered?.isConnected && paneElement.contains(remembered) && remembered.getClientRects().length > 0
      ? remembered
      : paneElement;
    target.focus({ preventScroll: true });
    lastWorkspacePaneRef.current = pane;
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rememberPane = (event: Event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      const pane = workspacePaneForElement(element);
      if (!pane) return;
      lastWorkspacePaneRef.current = pane;
      if (event.type === "focusin" && element) {
        if (pane === "reader") lastReaderFocusRef.current = element;
        else lastNoteFocusRef.current = element;
      }
    };
    workspace.addEventListener("focusin", rememberPane);
    workspace.addEventListener("pointerdown", rememberPane, true);
    return () => {
      workspace.removeEventListener("focusin", rememberPane);
      workspace.removeEventListener("pointerdown", rememberPane, true);
    };
  }, []);

  useEffect(() => {
    const pendingPane = pendingWorkspaceFocusRef.current;
    if (!pendingPane) return;
    if ((pendingPane === "reader" && workspaceMode !== "reader") || (pendingPane === "note" && workspaceMode !== "note")) return;
    pendingWorkspaceFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => focusWorkspacePane(pendingPane));
    return () => window.cancelAnimationFrame(frame);
  }, [focusWorkspacePane, workspaceMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F6" || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      const mode = workspaceModeRef.current;
      if (mode === "split") {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const currentPane = workspacePaneForElement(target) ?? lastWorkspacePaneRef.current;
        const nextPane = currentPane === "reader" ? "note" : "reader";
        focusWorkspacePane(nextPane);
        integrationRef.current.notify(nextPane === "reader" ? "Đã chuyển sang Reader (F6)" : "Đã chuyển sang Note (F6)");
        return;
      }
      const nextPane = mode === "reader" ? "note" : "reader";
      if (nextPane === "note" && !integrationRef.current.hasActiveNote) {
        changeWorkspaceMode("note");
        return;
      }
      pendingWorkspaceFocusRef.current = nextPane;
      changeWorkspaceMode(nextPane);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeWorkspaceMode, focusWorkspacePane]);

  const startDividerResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dividerCleanupRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (rect) setReaderShare(readerShareForPointer(rect.left, rect.width, moveEvent.clientX));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      if (dividerCleanupRef.current === cleanup) dividerCleanupRef.current = null;
    };
    dividerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }, []);

  useEffect(() => () => dividerCleanupRef.current?.(), []);

  const setNoteSidebarVisibility = useCallback((visible: boolean) => {
    setShowNoteSidebar(visible);
    try {
      localStorage.setItem(NOTE_SIDEBAR_PREFERENCE_KEY, visible ? "0" : "1");
      localStorage.removeItem(LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY);
    } catch {
      // UI preference is non-critical.
    }
  }, []);

  const workspaceStyle = useMemo(() => ({
    "--reader-share": `${readerShare}fr`,
    "--notes-share": `${100 - readerShare}fr`,
  }) as CSSProperties, [readerShare]);

  return {
    canShowNote: options.hasActiveNote,
    changeWorkspaceMode,
    getWorkspaceClassName: (pdfRailVisible, pdfRailTab) => `workspace workspace-mode-${workspaceMode} ${pdfRailVisible ? "" : "pdf-rail-collapsed"} ${showNoteSidebar ? "" : "note-sidebar-collapsed"} ${pdfRailTab === "pages" ? "" : "pdf-rail-wide"}`,
    readerShare,
    restoreLayout,
    setNoteSidebarVisibility,
    setReaderShare,
    setWorkspaceMode,
    showNoteSidebar,
    startDividerResize,
    workspaceMode,
    workspaceModeRef,
    workspaceRef,
    workspaceStyle,
  };
}
