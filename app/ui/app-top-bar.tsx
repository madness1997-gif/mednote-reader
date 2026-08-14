import { BookOpen, ChevronDown, Cloud, CloudOff, Columns2, Download, FolderOpen, Menu, NotebookTabs, RefreshCw } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WorkspaceItem, WorkspaceMode } from "../document-runtime-adapter";

type DriveStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export type AppTopBarScope = {
  activeWorkspace: WorkspaceItem;
  activeWorkspaceHasLinkedNote: boolean;
  addNotebook: () => void | Promise<unknown>;
  changeWorkspaceMode: (mode: WorkspaceMode) => void;
  documentName: string;
  driveStatus: DriveStatus;
  driveToken: string | null;
  hasActiveNote: boolean;
  previewPdfInputRef: RefObject<HTMLInputElement | null>;
  ready: boolean;
  saveTemporaryWorkspace: () => void | Promise<unknown>;
  setDrivePanelOpen: Dispatch<SetStateAction<boolean>>;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  toast: string;
  workspaceMode: WorkspaceMode;
};

export function AppTopBar({ scope }: { scope: AppTopBarScope }) {
  const { activeWorkspace, activeWorkspaceHasLinkedNote, addNotebook, changeWorkspaceMode, documentName, driveStatus, driveToken, hasActiveNote, previewPdfInputRef, ready, saveTemporaryWorkspace, setDrivePanelOpen, setLibraryOpen, toast, workspaceMode } = scope;
  return (<><header className="topbar">
        <div className="brand-group">
          <button className="icon-button menu-button" aria-label="Mở thư viện" onClick={() => setLibraryOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark">M</div><span className="brand-name">MedNote</span><span className="top-divider" />
          <button className="document-title" onClick={() => setLibraryOpen(true)}><span>{documentName}</span><ChevronDown size={15} /></button>
        </div>
        <div className="top-actions">
          <nav className="workspace-mode-switcher" aria-label="Chế độ không gian làm việc">
            <button className={workspaceMode === "split" ? "active" : ""} onClick={() => changeWorkspaceMode("split")} disabled={!hasActiveNote} title={!hasActiveNote ? "Tạo note trước để dùng chế độ Cả hai" : "Hiện Reader và Note"} aria-pressed={workspaceMode === "split"}><Columns2 size={16} /><span>Cả hai</span></button>
            <button className={workspaceMode === "reader" ? "active" : ""} onClick={() => changeWorkspaceMode("reader")} title="Chỉ hiện Reader" aria-pressed={workspaceMode === "reader"}><BookOpen size={16} /><span>Reader</span></button>
            <button className={workspaceMode === "note" ? "active" : ""} onClick={() => changeWorkspaceMode("note")} disabled={!hasActiveNote} title={!hasActiveNote ? "Chưa có note" : "Chỉ hiện Note"} aria-pressed={workspaceMode === "note"}><NotebookTabs size={16} /><span>Note</span></button>
          </nav>
          <span className="autosave-status"><i />{toast}</span>
          <button
            className={`drive-button ${driveToken ? "connected" : ""} ${driveStatus === "syncing" || driveStatus === "connecting" ? "busy" : ""}`}
            onClick={() => setDrivePanelOpen((open) => !open)}
            aria-label={driveToken ? "Mở đồng bộ Google Drive" : "Kết nối Google Drive"}
            title="Lưu và đồng bộ bằng Google Drive"
          >
            {driveStatus === "syncing" || driveStatus === "connecting" ? <RefreshCw size={16} /> : driveToken ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span>{driveStatus === "syncing" ? "Đang đồng bộ" : driveToken ? "Drive" : "Kết nối Drive"}</span>
          </button>
          {activeWorkspace.kind === "temporary" && <button className="save-session-button" onClick={() => { void saveTemporaryWorkspace(); }}><Download size={15} /> Lưu vào thư viện</button>}
          {activeWorkspace.documents.length > 0 && !activeWorkspaceHasLinkedNote && <button className="save-session-button" onClick={() => { void addNotebook(); }}><NotebookTabs size={15} /> Tạo note</button>}
          <button className="primary-button" disabled={!ready} onClick={() => previewPdfInputRef.current?.click()}><FolderOpen size={16} /> Mở PDF</button>
        </div>
      </header></>);
}
