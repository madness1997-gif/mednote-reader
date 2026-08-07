import NotePdfExporter from "./note-pdf-export";

export default function PdfExportE2EHarness() {
  return (
    <main
      data-pdf-export-e2e-harness="1"
      style={{ minHeight: "100vh", padding: 20, background: "#eef3f4", fontFamily: "Arial, sans-serif" }}
    >
      <div
        className="note-file-actions"
        style={{ display: "flex", alignItems: "center", minHeight: 48, padding: 8, background: "#fff" }}
      />

      <div className="note-thumbnails" style={{ marginTop: 12 }}>
        <button type="button" className="note-thumb active" style={{ padding: 8 }}>
          Tờ 1
        </button>
      </div>

      <div className="note-stage" style={{ marginTop: 12 }}>
        <div
          className="note-paper"
          style={{
            width: 420,
            height: 594,
            position: "relative",
            overflow: "hidden",
            background: "#fff",
            color: "#15242b",
            boxShadow: "0 3px 16px rgba(0,0,0,.12)",
            ['--note-natural-width' as string]: "420px",
            ['--note-natural-height' as string]: "594px",
          }}
        >
          <div style={{ padding: 28 }}>
            <div style={{ minHeight: 28, padding: "7px 10px", background: "#0e6b70", color: "#fff", fontWeight: 700 }}>
              MEDNOTE PDF E2E
            </div>
            <h2 style={{ margin: "24px 0 10px", fontSize: 22 }}>Sheet test</h2>
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>
              Đây là nội dung dùng để kiểm tra luồng Xuất PDF thật từ nút bấm tới Blob tải xuống.
            </p>
            <div style={{ marginTop: 24, width: 120, height: 120, borderRadius: 60, background: "#c7d8eb" }} />
          </div>
        </div>
      </div>

      <NotePdfExporter />
    </main>
  );
}
