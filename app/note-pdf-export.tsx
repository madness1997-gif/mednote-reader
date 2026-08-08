import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currentContext, pageGroups, type SheetPage } from "./page-sheet-state";
import { appendPaperToPdf, createPdfDocument, saveVerifiedPdf } from "./pdf-export-core";

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

function notePageIds() {
  const context = currentContext();
  if (context) return ((context.notebook.pages || []) as SheetPage[]).map((sheet) => String(sheet.id));
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper[data-note-page-id]");
  return paper?.dataset.notePageId ? [paper.dataset.notePageId] : [];
}

function buildExportPlans(): ExportPlan[] {
  const context = currentContext();
  const availablePageIds = notePageIds();
  if (!context) {
    return availablePageIds.length ? [{
      scope: "notebook",
      title: "Notebook",
      detail: `${availablePageIds.length} Sheet`,
      fileName: "MedNote.pdf",
      pageIndices: availablePageIds.map((_, index) => index),
    }] : [];
  }

  const { notebook, record, activeSection, activeSheet } = context;
  const physicalSheets = (notebook.pages || []) as SheetPage[];
  const indexById = new Map(physicalSheets.map((sheet, index) => [String(sheet.id), index]));
  const indicesForIds = (ids: string[]) => uniqueIndices(
    ids.map((id) => indexById.get(id)).filter((index): index is number => typeof index === "number"),
  );
  const sheetIdsForSection = (sectionId: string) => {
    const section = record.sections.find((item) => item.id === sectionId);
    return section ? pageGroups(notebook, section).flatMap((group) => group.sheets.map((sheet) => String(sheet.id))) : [];
  };

  const orderedNotebookIds = record.sections.flatMap((section) => sheetIdsForSection(section.id));
  const included = new Set(orderedNotebookIds);
  for (const sheet of physicalSheets) {
    const id = String(sheet.id);
    if (!included.has(id)) orderedNotebookIds.push(id);
  }

  const activeSheetId = String(activeSheet?.id || notebook.activePageId || "");
  const groups = pageGroups(notebook, activeSection);
  const activeGroup = groups.find((group) => group.sheets.some((sheet) => String(sheet.id) === activeSheetId)) || groups[0];
  const activeSheetIndex = activeGroup?.sheets.findIndex((sheet) => String(sheet.id) === activeSheetId) ?? -1;
  const notebookTitle = String(record.title || notebook.title || "Notebook").trim() || "Notebook";
  const sectionTitle = String(activeSection.title || "Section").trim() || "Section";
  const pageTitle = String(activeGroup?.title || "Page").trim() || "Page";
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

  if (activeGroup) {
    const ids = activeGroup.sheets.map((sheet) => String(sheet.id));
    plans.push({
      scope: "page",
      title: "Page",
      detail: `${pageTitle} · ${ids.length} Sheet`,
      fileName: `${safeFileName(`${notebookTitle} - ${pageTitle}`)}.pdf`,
      pageIndices: indicesForIds(ids),
    });
  }

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

async function activateNotePage(index: number) {
  const pageIds = notePageIds();
  const pageId = pageIds[index];
  if (!pageId) throw new Error(`Không tìm thấy Sheet ${index + 1}`);

  let paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (paper?.dataset.notePageId !== pageId) {
    window.dispatchEvent(new CustomEvent("mednote:activate-note-page", { detail: pageId }));
  }

  for (let attempt = 0; attempt < 45; attempt += 1) {
    paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
    if (paper?.dataset.notePageId === pageId) break;
    await nextFrame();
    if (attempt === 44) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);
  }

  await settleLayout();
  paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (!paper) throw new Error("Không tìm thấy Sheet để xuất");
  return paper;
}

async function exportPlanToPdfBytes(plan: ExportPlan, onProgress: (progress: ExportProgress) => void) {
  const pageIds = notePageIds();
  if (!pageIds.length) throw new Error("Notebook chưa có Sheet nào");
  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);

  const currentPaper = document.querySelector<HTMLElement>(".note-stage .note-paper");
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
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [ready, setReady] = useState<ReadyPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".note-file-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (readyUrlRef.current) URL.revokeObjectURL(readyUrlRef.current);
  }, []);

  const plans = useMemo(() => buildExportPlans(), [target, menuOpen, progress, ready, error]);
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
