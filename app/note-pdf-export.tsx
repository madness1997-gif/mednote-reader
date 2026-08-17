import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appendPaperToPdf, createPdfDocument, saveVerifiedPdf } from "./pdf-export-core";
import { ordered, type NoteStructure } from "./note-domain";
import { noteStore, useNoteStoreSnapshot } from "./note-store";

type ExportScope = "notebook" | "section" | "page" | "sheet";
type ExportPlan = {
  scope: ExportScope;
  title: string;
  detail: string;
  fileName: string;
  pageIndices: number[];
};
type ExportProgress = {
  page: number;
  total: number;
  scope: ExportScope;
  phase: "prepare" | "capture" | "save";
};
type ReadyPdf = { url: string; fileName: string; bytes: number };

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function settleLayout() {
  await nextFrame();
  await nextFrame();
  await delay(24);
}

function safeFileName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "MedNote";
}

function uniqueIndices(indices: number[]) {
  return [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0))];
}

function notePageIds(structure = noteStore.getSnapshot().structure) {
  if (structure) {
    const notebookId = structure.active.activeNotebookId;
    const sectionIds = new Set(ordered(structure.sections.filter((section) => section.notebookId === notebookId)).map((section) => section.id));
    const pages = ordered(structure.pages.filter((page) => sectionIds.has(page.sectionId)));
    return pages.flatMap((page) => ordered(structure.sheets.filter((sheet) => sheet.pageId === page.id)).map((sheet) => sheet.id));
  }
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper[data-note-page-id]");
  return paper?.dataset.notePageId ? [paper.dataset.notePageId] : [];
}

function buildExportPlans(structure: NoteStructure | null): ExportPlan[] {
  const availablePageIds = notePageIds(structure);
  if (!structure) {
    return availablePageIds.length ? [{
      scope: "notebook",
      title: "Notebook",
      detail: `${availablePageIds.length} Sheet`,
      fileName: "MedNote.pdf",
      pageIndices: availablePageIds.map((_, index) => index),
    }] : [];
  }

  const active = structure.active;
  const notebook = structure.notebooks.find((record) => record.id === active.activeNotebookId);
  const activeSection = structure.sections.find((record) => record.id === active.activeSectionId);
  const activePage = structure.pages.find((record) => record.id === active.activePageId);
  if (!notebook || !activeSection || !activePage) return [];
  const indexById = new Map(availablePageIds.map((id, index) => [id, index]));
  const indicesForIds = (ids: string[]) => uniqueIndices(
    ids.map((id) => indexById.get(id)).filter((index): index is number => typeof index === "number"),
  );
  const sheetIdsForSection = (sectionId: string) => {
    const pages = ordered(structure.pages.filter((page) => page.sectionId === sectionId));
    return pages.flatMap((page) => ordered(structure.sheets.filter((sheet) => sheet.pageId === page.id)).map((sheet) => sheet.id));
  };

  const orderedNotebookIds = [...availablePageIds];
  const activeSheetId = active.activeSheetId;
  const activePageSheets = ordered(structure.sheets.filter((sheet) => sheet.pageId === activePage.id));
  const activeSheetIndex = activePageSheets.findIndex((sheet) => sheet.id === activeSheetId);
  const notebookTitle = String(notebook.title || "Notebook").trim() || "Notebook";
  const sectionTitle = String(activeSection.title || "Section").trim() || "Section";
  const pageTitle = String(activePage.title || "Page").trim() || "Page";
  const sheetLabel = activeSheetIndex >= 0 ? `Sheet ${activeSheetIndex + 1}` : "Sheet hiện tại";

  const plans: ExportPlan[] = [
    {
      scope: "notebook",
      title: "Notebook",
      detail: `${notebookTitle} · ${orderedNotebookIds.length} Sheet`,
      fileName: `${safeFileName(notebookTitle)}.pdf`,
      pageIndices: indicesForIds(orderedNotebookIds),
    },
    {
      scope: "section",
      title: "Section",
      detail: `${sectionTitle} · ${sheetIdsForSection(activeSection.id).length} Sheet`,
      fileName: `${safeFileName(`${notebookTitle} - ${sectionTitle}`)}.pdf`,
      pageIndices: indicesForIds(sheetIdsForSection(activeSection.id)),
    },
  ];

  const ids = activePageSheets.map((sheet) => sheet.id);
  plans.push({
    scope: "page",
    title: "Page",
    detail: `${pageTitle} · ${ids.length} Sheet`,
    fileName: `${safeFileName(`${notebookTitle} - ${pageTitle}`)}.pdf`,
    pageIndices: indicesForIds(ids),
  });

  if (activeSheetId && indexById.has(activeSheetId)) {
    plans.push({
      scope: "sheet",
      title: "Sheet",
      detail: `${pageTitle} · ${sheetLabel}`,
      fileName: `${safeFileName(`${notebookTitle} - ${pageTitle} - ${sheetLabel}`)}.pdf`,
      pageIndices: indicesForIds([activeSheetId]),
    });
  }

  return plans;
}

function activeNotePaper() {
  return document.querySelector<HTMLElement>(".note-stage .note-paper.interactive[data-note-page-id]")
    || document.querySelector<HTMLElement>(".note-stage .note-paper:not(.note-paper-preview)[data-note-page-id]")
    || document.querySelector<HTMLElement>(".note-stage .note-paper[data-note-page-id]");
}

async function activateNotePage(index: number) {
  const pageIds = notePageIds();
  const pageId = pageIds[index];
  if (!pageId) throw new Error(`Không tìm thấy Sheet ${index + 1}`);

  let paper = activeNotePaper();
  if (paper?.dataset.notePageId !== pageId) {
    await noteStore.openSheet(pageId);
  }

  for (let attempt = 0; attempt < 45; attempt += 1) {
    paper = activeNotePaper();
    if (paper?.dataset.notePageId === pageId) break;
    await nextFrame();
    if (attempt === 44) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);
  }

  await settleLayout();
  paper = activeNotePaper();
  if (!paper || paper.dataset.notePageId !== pageId) throw new Error(`Không tải được Sheet ${index + 1} để xuất`);
  return paper;
}

async function exportPlanToPdfBytes(plan: ExportPlan, onProgress: (progress: ExportProgress) => void) {
  const pageIds = notePageIds();
  if (!pageIds.length) throw new Error("Notebook chưa có Sheet nào");
  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);

  const currentPaper = activeNotePaper();
  const originalIndex = Math.max(0, pageIds.indexOf(currentPaper?.dataset.notePageId || pageIds[0]));
  const pdf = await createPdfDocument();
  document.body.classList.add("note-pdf-export-active");

  try {
    for (let position = 0; position < plan.pageIndices.length; position += 1) {
      const displayPage = position + 1;
      onProgress({ page: displayPage, total: plan.pageIndices.length, scope: plan.scope, phase: "prepare" });
      const paper = await activateNotePage(plan.pageIndices[position]);
      onProgress({ page: displayPage, total: plan.pageIndices.length, scope: plan.scope, phase: "capture" });
      await appendPaperToPdf(pdf, paper, displayPage);
      await nextFrame();
    }
  } finally {
    document.querySelectorAll<HTMLElement>(".note-pdf-exporting").forEach((paper) => paper.classList.remove("note-pdf-exporting"));
    await activateNotePage(originalIndex).catch(() => undefined);
    document.body.classList.remove("note-pdf-export-active");
  }

  onProgress({ page: plan.pageIndices.length, total: plan.pageIndices.length, scope: plan.scope, phase: "save" });
  return saveVerifiedPdf(pdf);
}

function makePdfUrl(bytes: Uint8Array) {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
}

export default function NotePdfExporter() {
  const noteState = useNoteStoreSnapshot();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [plans, setPlans] = useState<ExportPlan[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [ready, setReady] = useState<ReadyPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const findTarget = () => {
      const next = document.querySelector<HTMLElement>(".note-file-actions");
      setTarget((current) => current === next ? current : next);
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const refreshPlans = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = buildExportPlans(noteState.structure);
        setPlans((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      });
    };
    refreshPlans();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [target, noteState.revision]);

  useEffect(() => () => {
    if (readyUrlRef.current) URL.revokeObjectURL(readyUrlRef.current);
  }, []);

  if (!target) return null;
  const exporting = progress !== null;

  const clearReady = () => {
    if (readyUrlRef.current) {
      URL.revokeObjectURL(readyUrlRef.current);
      readyUrlRef.current = null;
    }
    setReady(null);
  };

  const startExport = (plan: ExportPlan) => {
    setMenuOpen(false);
    setError(null);
    clearReady();
    setProgress({ page: 0, total: plan.pageIndices.length, scope: plan.scope, phase: "prepare" });

    void exportPlanToPdfBytes(plan, setProgress)
      .then((bytes) => {
        const url = makePdfUrl(bytes);
        readyUrlRef.current = url;
        setReady({ url, fileName: plan.fileName, bytes: bytes.length });
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Không thể xuất PDF");
      })
      .finally(() => setProgress(null));
  };

  const toolbar = createPortal(
    <div className="note-pdf-export-wrap">
      <button
        className="note-create-button note-pdf-export-button"
        disabled={exporting || !plans.length}
        onClick={() => {
          setError(null);
          setMenuOpen(true);
        }}
        title="Xuất PDF theo Notebook, Section, Page hoặc Sheet"
        aria-label="Xuất note thành PDF"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <FileDown size={16} />
        <span>Xuất PDF</span>
        <ChevronDown size={13} />
      </button>
    </div>,
    target,
  );

  const overlay = (menuOpen || exporting || ready || error) ? createPortal(
    <div className="note-pdf-export-layer" role="presentation" onMouseDown={(event) => {
      if (event.target !== event.currentTarget || exporting) return;
      setMenuOpen(false);
      if (ready) clearReady();
      setError(null);
    }}>
      <div className="note-pdf-export-dialog" role="dialog" aria-modal="true" aria-label="Xuất PDF">
        {menuOpen && !exporting && !ready && !error && (
          <>
            <div className="note-pdf-export-dialog-title">Xuất PDF</div>
            <div className="note-pdf-export-dialog-hint">Chọn phạm vi cần xuất</div>
            <div className="note-pdf-export-menu note-pdf-export-menu-portal">
              {plans.map((plan) => (
                <button
                  key={plan.scope}
                  type="button"
                  onClick={() => startExport(plan)}
                  disabled={!plan.pageIndices.length}
                  data-export-scope={plan.scope}
                >
                  <strong>{plan.title}</strong>
                  <small>{plan.detail}</small>
                </button>
              ))}
            </div>
            <button type="button" className="note-pdf-export-close" onClick={() => setMenuOpen(false)}>Hủy</button>
          </>
        )}

        {exporting && progress && (
          <div className="note-pdf-export-status">
            <strong>Đang tạo PDF…</strong>
            <small>
              {progress.phase === "save"
                ? "Đang ghép và kiểm tra file PDF…"
                : progress.phase === "capture"
                  ? `Đang dựng Sheet ${progress.page}/${progress.total}…`
                  : `Đang chuẩn bị Sheet ${Math.max(1, progress.page)}/${progress.total}…`}
            </small>
            <div className="note-pdf-export-progress"><i style={{ width: `${progress.phase === "save" ? 96 : Math.max(8, (progress.page / Math.max(1, progress.total)) * 88)}%` }} /></div>
          </div>
        )}

        {ready && !exporting && (
          <div className="note-pdf-export-status">
            <strong>PDF đã tạo xong</strong>
            <small>{ready.fileName} · {Math.max(1, Math.round(ready.bytes / 1024))} KB</small>
            <div className="note-pdf-export-ready-actions">
              <a className="primary" href={ready.url} download={ready.fileName} data-pdf-download="1">Tải PDF</a>
              <a href={ready.url} target="_blank" rel="noopener noreferrer">Mở PDF</a>
            </div>
            <button type="button" className="note-pdf-export-close" onClick={clearReady}>Đóng</button>
          </div>
        )}

        {error && !exporting && (
          <div className="note-pdf-export-status">
            <strong>Xuất PDF thất bại</strong>
            <small>{error}</small>
            <button type="button" className="note-pdf-export-close" onClick={() => setError(null)}>Đóng</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{toolbar}{overlay}</>;
}
