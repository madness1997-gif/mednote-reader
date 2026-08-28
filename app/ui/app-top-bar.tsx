import { BookOpen, ChevronDown, Cloud, CloudOff, Columns2, Download, FolderOpen, Menu, NotebookTabs, RefreshCw } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceItem, WorkspaceMode } from "../document-runtime-adapter";
import { useActiveDriveController } from "../drive-controller";
import type { DocumentWorkspaceController } from "../use-document-workspace-controller";

export type AppTopBarScope = {
  activeWorkspace: WorkspaceItem;
  changeWorkspaceMode: (mode: WorkspaceMode) => void;
  documentName: string;
  documents: DocumentWorkspaceController;
  hasActiveNote: boolean;
  ready: boolean;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  toast: string;
  workspaceMode: WorkspaceMode;
};

export function AppTopBar({ scope }: { scope: AppTopBarScope }) {
  const { activeWorkspace, changeWorkspaceMode, documentName, documents, hasActiveNote, ready, setLibraryOpen, toast, workspaceMode } = scope;
  const drive = useActiveDriveController();
  return (<><header className="topbar">
        <div className="brand-group">
          <button className="icon-button menu-button" aria-label="Mở thư viện" onClick={() => setLibraryOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark">M</div><span className="brand-name">MedNote</span><span className="top-divider" />
          <button className="document-title" onClick={() => setLibraryOpen(true)}><span>{documentName}</span><ChevronDown size={15} /></button>
        </div>
        <div className="top-actions">
          <nav className="workspace-mode-switcher" aria-label="Chế độ không gian làm việc">
            <button className={workspaceMode === "split" ? "active" : ""} onClick={() => changeWorkspaceMode("split")} disabled={!hasActiveNote} title={!hasActiveNote ? "Tạo note trước để dùng chế độ Cả hai" : "Hiện Reader và Note"} aria-pressed={workspaceMode === "split"}><Columns2 size={16} /><span>Cả hai</span></button>
            <button className={workspaceMode === "reader" ? "active" : ""} onClick={() => changeWorkspaceMode("reader")} title="Chỉ hiện Reader · F6 chuyển Reader/Note" aria-pressed={workspaceMode === "reader"}><BookOpen size={16} /><span>Reader</span></button>
            <button className={workspaceMode === "note" ? "active" : ""} onClick={() => changeWorkspaceMode("note")} disabled={!hasActiveNote} title={!hasActiveNote ? "Chưa có note" : "Chỉ hiện Note · F6 chuyển Reader/Note"} aria-pressed={workspaceMode === "note"}><NotebookTabs size={16} /><span>Note</span></button>
          </nav>
          <span className="autosave-status"><i />{toast}</span>
          <button
            className={`drive-button ${drive.token ? "connected" : ""} ${drive.status === "syncing" || drive.status === "connecting" ? "busy" : ""}`}
            onClick={drive.togglePanel}
            aria-label={drive.token ? "Mở đồng bộ Google Drive" : "Kết nối Google Drive"}
            title="Lưu và đồng bộ bằng Google Drive"
          >
            {drive.status === "syncing" || drive.status === "connecting" ? <RefreshCw size={16} /> : drive.token ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span>{drive.status === "syncing" ? "Đang đồng bộ" : drive.token ? "Drive" : "Kết nối Drive"}</span>
          </button>
          {activeWorkspace.kind === "temporary" && <button className="save-session-button" onClick={() => { void documents.saveTemporaryWorkspace(); }}><Download size={15} /> Lưu vào thư viện</button>}
          {activeWorkspace.documents.length > 0 && !documents.activeWorkspaceHasLinkedNote && <button className="save-session-button" onClick={() => { void documents.createLinkedNotebook(); }}><NotebookTabs size={15} /> Tạo note</button>}
          <button className="primary-button" disabled={!ready} onClick={documents.openPreviewPdfPicker}><FolderOpen size={16} /> Mở PDF</button>
        </div>
      </header></>);
}
