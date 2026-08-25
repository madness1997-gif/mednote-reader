import { CloudOff, DownloadCloud, RefreshCw, UploadCloud, X } from "lucide-react";
import { useActiveDriveController } from "../drive-controller";

export function DrivePanel() {
  const drive = useActiveDriveController();
  const preparingWebAuthorization = !drive.isDesktopApp && !drive.authorizationReady && drive.preparingAuthorization;

  return (<><aside className="drive-panel" aria-label="Google Drive">
          <div className="drive-panel-header">
            <div><strong>Google Drive</strong><span>JSON, PDF gốc và hình cắt</span></div>
            <button className="icon-button compact" onClick={drive.closePanel} aria-label="Đóng"><X size={17} /></button>
          </div>
          {drive.user ? (
            <>
              <div className="drive-account">
                {drive.user.photoLink ? <img src={drive.user.photoLink} alt="" /> : <span>{drive.user.displayName.slice(0, 1).toUpperCase()}</span>}
                <div><strong>{drive.user.displayName}</strong><small>{drive.user.emailAddress}</small></div>
                <i className={drive.status === "error" ? "error" : ""} />
              </div>
              {!drive.ready && <div className="drive-conflict"><strong>Chọn bản dữ liệu muốn dùng</strong><span>Drive và thiết bị này đều đang có workspace. MedNote sẽ không tự ghi đè khi chưa chọn.</span></div>}
              <div className="drive-actions">
                <button onClick={() => { void drive.sync(); }} disabled={drive.status === "syncing"}><UploadCloud size={17} /><span><strong>Lưu bản này lên Drive</strong><small>Cập nhật Drive từ thiết bị hiện tại</small></span></button>
                <button onClick={() => { void drive.restore(); }} disabled={drive.status === "syncing"}><DownloadCloud size={17} /><span><strong>Tải bản từ Drive</strong><small>Khôi phục workspace và các tệp</small></span></button>
              </div>
              <label className="drive-auto-sync"><input type="checkbox" checked={drive.autoSync} disabled={!drive.ready} onChange={(event) => drive.setAutoSync(event.target.checked)} /><span><strong>Tự động đồng bộ</strong><small>Vẫn luôn lưu một bản cục bộ trên thiết bị</small></span></label>
              <div className="drive-panel-footer">
                <span>{drive.error || (drive.lastSyncedAt ? `Lần cuối: ${new Date(drive.lastSyncedAt).toLocaleString("vi-VN")}` : "Đã kết nối, chưa đồng bộ")}</span>
                <div>{drive.status === "error" && <button onClick={() => { void drive.connect(); }}>Kết nối lại</button>}{drive.isDesktopApp && <button onClick={drive.changeClient}>Đổi OAuth client</button>}<button onClick={drive.disconnect}>Ngắt kết nối</button></div>
              </div>
            </>
          ) : (
            <div className={`drive-empty ${drive.error ? "error" : ""}`}>
              {drive.status === "connecting" || preparingWebAuthorization ? <RefreshCw className="spin" size={28} /> : <CloudOff size={28} />}
              <strong>{drive.status === "connecting" ? "Đang kết nối…" : preparingWebAuthorization ? "Đang chuẩn bị đăng nhập…" : "Chưa thể dùng Google Drive"}</strong>
              <span>{drive.error || (preparingWebAuthorization ? "Đang tải dịch vụ đăng nhập Google." : "Đăng nhập để lưu workspace trên Drive.")}</span>
              {drive.isDesktopApp && <>
                <label className="drive-client-id"><span>OAuth Client ID (Desktop)</span><input disabled={drive.status === "connecting"} value={drive.desktopClientId} onChange={(event) => drive.setDesktopClientId(event.target.value)} placeholder="…apps.googleusercontent.com" spellCheck={false} /><small>Dùng Client ID loại Desktop app.</small></label>
                <label className="drive-client-id"><span>Client Secret (Desktop)</span><input disabled={drive.status === "connecting"} type="password" value={drive.desktopClientSecret} onChange={(event) => drive.setDesktopClientSecret(event.target.value)} placeholder="GOCSPX-…" autoComplete="off" spellCheck={false} /><small>Dán installed.client_secret; để trống nếu Google không cấp Secret. Chỉ lưu mã hóa sau khi kết nối.</small></label>
                <label className={`drive-oauth-import ${drive.status === "connecting" ? "disabled" : ""}`}>
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={drive.status === "connecting"}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      void drive.importDesktopOAuth(input.files?.[0]).finally(() => { input.value = ""; });
                    }}
                  />
                  <span>Nhập tệp OAuth Desktop JSON</span>
                </label>
              </>}
              {drive.status === "connecting"
                ? <button onClick={() => { void drive.cancelConnection(); }}>Hủy kết nối</button>
                : !drive.isDesktopApp && !drive.authorizationReady
                  ? <button disabled={drive.preparingAuthorization} onClick={() => { void drive.retryAuthorizationPreparation(); }}>{drive.preparingAuthorization ? "Đang tải đăng nhập…" : "Tải lại đăng nhập"}</button>
                : <button onClick={() => { void drive.connect(); }}>Kết nối</button>}
            </div>
          )}
        </aside></>);
}
