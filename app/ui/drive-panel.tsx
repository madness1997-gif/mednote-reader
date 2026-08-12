import { CloudOff, DownloadCloud, RefreshCw, UploadCloud, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { DriveAccount } from "../drive-sync-service";

type DriveStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export type DrivePanelScope = {
  IS_DESKTOP_APP: boolean;
  connectDrive: () => void | Promise<unknown>;
  desktopGoogleClientId: string;
  desktopGoogleClientSecret: string;
  disconnectDrive: () => void | Promise<unknown>;
  driveAutoSync: boolean;
  driveError: string | null;
  driveLastSyncedAt: number | null;
  driveReady: boolean;
  driveStatus: DriveStatus;
  driveUser: DriveAccount | null;
  restoreFromDrive: () => void | Promise<unknown>;
  setDesktopGoogleClientId: Dispatch<SetStateAction<string>>;
  setDesktopGoogleClientSecret: Dispatch<SetStateAction<string>>;
  setDriveAutoSync: Dispatch<SetStateAction<boolean>>;
  setDriveError: Dispatch<SetStateAction<string | null>>;
  setDrivePanelOpen: Dispatch<SetStateAction<boolean>>;
  syncToDrive: () => void | Promise<unknown>;
};

export function DrivePanel({ scope }: { scope: DrivePanelScope }) {
  const { IS_DESKTOP_APP, connectDrive, desktopGoogleClientId, desktopGoogleClientSecret, disconnectDrive, driveAutoSync, driveError, driveLastSyncedAt, driveReady, driveStatus, driveUser, restoreFromDrive, setDesktopGoogleClientId, setDesktopGoogleClientSecret, setDriveAutoSync, setDriveError, setDrivePanelOpen, syncToDrive } = scope;

  return (<><aside className="drive-panel" aria-label="Google Drive">
          <div className="drive-panel-header">
            <div><strong>Google Drive</strong><span>JSON, PDF gốc và hình cắt</span></div>
            <button className="icon-button compact" onClick={() => setDrivePanelOpen(false)} aria-label="Đóng"><X size={17} /></button>
          </div>
          {driveUser ? (
            <>
              <div className="drive-account">
                {driveUser.photoLink ? <img src={driveUser.photoLink} alt="" /> : <span>{driveUser.displayName.slice(0, 1).toUpperCase()}</span>}
                <div><strong>{driveUser.displayName}</strong><small>{driveUser.emailAddress}</small></div>
                <i className={driveStatus === "error" ? "error" : ""} />
              </div>
              {!driveReady && <div className="drive-conflict"><strong>Chọn bản dữ liệu muốn dùng</strong><span>Drive và thiết bị này đều đang có workspace. MedNote sẽ không tự ghi đè khi chưa chọn.</span></div>}
              <div className="drive-actions">
                <button onClick={() => { void syncToDrive(); }} disabled={driveStatus === "syncing"}><UploadCloud size={17} /><span><strong>Lưu bản này lên Drive</strong><small>Cập nhật Drive từ thiết bị hiện tại</small></span></button>
                <button onClick={() => { void restoreFromDrive(); }} disabled={driveStatus === "syncing"}><DownloadCloud size={17} /><span><strong>Tải bản từ Drive</strong><small>Khôi phục workspace và các tệp</small></span></button>
              </div>
              <label className="drive-auto-sync"><input type="checkbox" checked={driveAutoSync} disabled={!driveReady} onChange={(event) => setDriveAutoSync(event.target.checked)} /><span><strong>Tự động đồng bộ</strong><small>Vẫn luôn lưu một bản cục bộ trên thiết bị</small></span></label>
              <div className="drive-panel-footer">
                <span>{driveError || (driveLastSyncedAt ? `Lần cuối: ${new Date(driveLastSyncedAt).toLocaleString("vi-VN")}` : "Đã kết nối, chưa đồng bộ")}</span>
                <div>{driveStatus === "error" && <button onClick={() => { void connectDrive(); }}>Kết nối lại</button>}<button onClick={disconnectDrive}>Ngắt kết nối</button></div>
              </div>
            </>
          ) : (
            <div className={`drive-empty ${driveError ? "error" : ""}`}>
              {driveStatus === "connecting" ? <RefreshCw className="spin" size={28} /> : <CloudOff size={28} />}
              <strong>{driveStatus === "connecting" ? "Đang kết nối…" : "Chưa thể dùng Google Drive"}</strong>
              <span>{driveError || "Đăng nhập để lưu workspace trên Drive."}</span>
              {IS_DESKTOP_APP && driveStatus !== "connecting" && <>
                <label className="drive-client-id"><span>OAuth Client ID (Desktop)</span><input value={desktopGoogleClientId} onChange={(event) => { setDesktopGoogleClientId(event.target.value.trim()); setDriveError(null); }} placeholder="…apps.googleusercontent.com" spellCheck={false} /><small>Dùng Client ID loại Desktop app.</small></label>
                <label className="drive-client-id"><span>Client Secret (Desktop)</span><input type="password" value={desktopGoogleClientSecret} onChange={(event) => { setDesktopGoogleClientSecret(event.target.value.trim()); setDriveError(null); }} placeholder="GOCSPX-…" autoComplete="off" spellCheck={false} /><small>Dán installed.client_secret; để trống nếu Google không cấp Secret. Chỉ lưu mã hóa sau khi kết nối.</small></label>
              </>}
              {driveStatus !== "connecting" && <button onClick={() => { void connectDrive(); }}>Kết nối</button>}
            </div>
          )}
        </aside></>);
}
