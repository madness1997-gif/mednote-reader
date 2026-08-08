import type { Plugin } from "vite";

const PDF_RAIL_START = '        <aside className={`pdf-thumbnails pdf-panel-${pdfRailTab}`} aria-label="Điều hướng tài liệu">';
const PDF_RAIL_TO_READER = '        </aside>\n\n        <section className="reader-pane">';
const READER_TO_NOTES = '        </section>\n\n        <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>\n\n        <section className="notes-pane">';
const NOTES_TO_NAV = '        </section>\n        <aside className="note-navigation-host" aria-label="Điều hướng ghi chú" />';

function replaceRequired(code: string, anchor: string, replacement: string, label: string) {
  const first = code.indexOf(anchor);
  if (first < 0) throw new Error(`Không tìm thấy vị trí ${label} để bật suspend pane.`);
  if (code.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`Tìm thấy nhiều vị trí ${label}; cần cập nhật workspace suspension transform.`);
  return code.replace(anchor, replacement);
}

export function workspaceSuspensionPlugin(): Plugin {
  return {
    name: "mednote-workspace-suspension",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;

      // In Note-only mode the PDF navigation and reader subtree are not mounted.
      // The PDFDocument/PDFium state stays alive in Home, so returning to Reader
      // is fast while page canvases, text layers and thumbnail canvases are freed.
      next = replaceRequired(
        next,
        PDF_RAIL_START,
        `        {workspaceMode !== "note" && (\n${PDF_RAIL_START}`,
        "PDF rail",
      );
      next = replaceRequired(
        next,
        PDF_RAIL_TO_READER,
        '        </aside>\n        )}\n\n        {workspaceMode !== "note" && (\n        <section className="reader-pane">',
        "ranh giới PDF rail/Reader",
      );

      // The divider only exists when both panes are mounted. Reader-only mode
      // removes the full Note editor subtree and the OneNote navigation host.
      next = replaceRequired(
        next,
        READER_TO_NOTES,
        '        </section>\n        )}\n\n        {workspaceMode === "split" && <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>}\n\n        {workspaceMode !== "reader" && (\n        <section className="notes-pane">',
        "ranh giới Reader/Note",
      );
      next = replaceRequired(
        next,
        NOTES_TO_NAV,
        '        </section>\n        )}\n\n        {workspaceMode !== "reader" && <aside className="note-navigation-host" aria-label="Điều hướng ghi chú" />}',
        "ranh giới Note/OneNote navigation",
      );

      return { code: next, map: null };
    },
  };
}
