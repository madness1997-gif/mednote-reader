import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currentContext, pageGroups, type SheetPage } from "./page-sheet-state";

const CONTROL_SELECTOR = [
  ".excerpt-object-controls",
  ".excerpt-resize-handle",
  ".excerpt-rotate-handle",
  ".callout-anchor-handle",
  ".mode-hint",
  ".citation-chip",
  ".note-selection-box",
].join(",");

type ExportScope = "notebook" | "section" | "page" | "sheet";
type ExportPlan = {
  scope: ExportScope;
  title: string;
  detail: string;
  fileName: string;
  pageIndices: number[];
};
type ExportProgress = { page: number; total: number; scope: ExportScope };
type PrintTarget = {
  win: Window;
  doc: Document;
  cleanup: () => void;
};

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

function buildExportPlans(): ExportPlan[] {
  const context = currentContext();
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!context) {
    return thumbnails.length ? [{
      scope: "notebook",
      title: "Notebook",
      detail: `${thumbnails.length} Sheet`,
      fileName: "MedNote.pdf",
      pageIndices: thumbnails.map((_, index) => index),
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
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  const thumbnail = thumbnails[index];
  if (!thumbnail) throw new Error(`Không tìm thấy Sheet ${index + 1}`);
  if (!thumbnail.classList.contains("active")) thumbnail.click();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"))
      .findIndex((item) => item.classList.contains("active"));
    if (current === index) break;
    await nextFrame();
    if (attempt === 29) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);
  }

  await settleLayout();
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (!paper) throw new Error("Không tìm thấy Sheet để xuất");
  return paper;
}

function copyCanvasPixels(source: HTMLElement, clone: HTMLElement) {
  const sourceCanvases = Array.from(source.querySelectorAll<HTMLCanvasElement>("canvas"));
  const clonedCanvases = Array.from(clone.querySelectorAll<HTMLCanvasElement>("canvas"));
  sourceCanvases.forEach((canvas, index) => {
    const target = clonedCanvases[index];
    if (!target) return;
    try {
      const image = clone.ownerDocument.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.alt = "";
      image.width = canvas.width;
      image.height = canvas.height;
      image.setAttribute("style", target.getAttribute("style") || "");
      image.style.width = target.style.width || `${canvas.clientWidth || canvas.width}px`;
      image.style.height = target.style.height || `${canvas.clientHeight || canvas.height}px`;
      target.replaceWith(image);
    } catch {
      target.remove();
    }
  });
}

function clonePaperForPrint(source: HTMLElement, targetDocument: Document) {
  const clone = targetDocument.importNode(source, true) as HTMLElement;
  clone.querySelectorAll(CONTROL_SELECTOR).forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
  clone.querySelectorAll<HTMLElement>(".selected,.editable,.movable").forEach((element) => {
    element.classList.remove("selected", "editable", "movable");
  });
  copyCanvasPixels(source, clone);
  clone.classList.remove("note-pdf-exporting");
  return clone;
}

function installPrintStyles(targetDocument: Document) {
  const base = targetDocument.createElement("base");
  base.href = document.baseURI;
  targetDocument.head.append(base);

  document.querySelectorAll("link[rel='stylesheet'], style").forEach((node) => {
    targetDocument.head.append(targetDocument.importNode(node, true));
  });

  const style = targetDocument.createElement("style");
  style.textContent = `
    html,body{margin:0!important;padding:0!important;background:#fff!important;color-adjust:exact!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    body{overflow:visible!important}
    #mednote-print-root{display:block!important;margin:0!important;padding:0!important;background:#fff!important}
    .mednote-print-sheet{display:block!important;position:relative!important;margin:0 auto!important;padding:0!important;break-after:page!important;page-break-after:always!important;overflow:visible!important;background:#fff!important}
    .mednote-print-sheet:last-child{break-after:auto!important;page-break-after:auto!important}
    .mednote-print-sheet>.note-paper{display:block!important;position:relative!important;transform:none!important;scale:1!important;margin:0 auto!important;box-shadow:none!important;filter:none!important;outline:none!important}
    ${CONTROL_SELECTOR}{display:none!important}
    @media print{
      @page{margin:0}
      html,body,#mednote-print-root{width:100%!important;height:auto!important;overflow:visible!important}
      .mednote-print-sheet{break-inside:avoid!important;page-break-inside:avoid!important}
    }
  `;
  targetDocument.head.append(style);
}

function openPrintTarget(fileName: string): PrintTarget {
  const title = fileName.replace(/\.pdf$/i, "");
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<&>]/g, "")}</title></head><body><div id="mednote-print-root"></div></body></html>`);
    popup.document.close();
    installPrintStyles(popup.document);
    return {
      win: popup,
      doc: popup.document,
      cleanup: () => {
        try { popup.close(); } catch { /* ignore */ }
      },
    };
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.append(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Trình duyệt không cho mở tài liệu PDF");
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<&>]/g, "")}</title></head><body><div id="mednote-print-root"></div></body></html>`);
  doc.close();
  installPrintStyles(doc);
  return { win, doc, cleanup: () => iframe.remove() };
}

async function exportPlanToPdf(plan: ExportPlan, target: PrintTarget, onProgress: (page: number, total: number) => void) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!thumbnails.length) throw new Error("Notebook chưa có Sheet nào");
  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);

  const originalIndex = Math.max(0, thumbnails.findIndex((thumbnail) => thumbnail.classList.contains("active")));
  const root = target.doc.getElementById("mednote-print-root");
  if (!root) throw new Error("Không tạo được tài liệu in");

  try {
    for (let position = 0; position < plan.pageIndices.length; position += 1) {
      const displayPage = position + 1;
      onProgress(displayPage, plan.pageIndices.length);
      document.dispatchEvent(new CustomEvent("mednote:pdf-export-progress", {
        detail: { page: displayPage, total: plan.pageIndices.length, scope: plan.scope, phase: "prepare" },
      }));

      const source = await activateNotePage(plan.pageIndices[position]);
      const wrapper = target.doc.createElement("section");
      wrapper.className = "mednote-print-sheet";
      wrapper.append(clonePaperForPrint(source, target.doc));
      root.append(wrapper);
      await nextFrame();
    }
  } finally {
    await activateNotePage(originalIndex).catch(() => undefined);
  }

  document.dispatchEvent(new CustomEvent("mednote:pdf-export-progress", {
    detail: { page: plan.pageIndices.length, total: plan.pageIndices.length, scope: plan.scope, phase: "print" },
  }));

  await Promise.race([
    target.doc.fonts?.ready ?? Promise.resolve(),
    delay(1200),
  ]).catch(() => undefined);
  await delay(120);

  const cleanup = target.cleanup;
  let cleaned = false;
  const finish = () => {
    if (cleaned) return;
    cleaned = true;
    window.setTimeout(cleanup, 300);
  };
  target.win.addEventListener("afterprint", finish, { once: true });
  target.win.focus();
  target.win.print();
  window.setTimeout(() => {
    if (target.win.closed) finish();
  }, 30_000);
}

export default function NotePdfExporter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".note-file-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [menuOpen]);

  if (!target) return null;
  const exporting = progress !== null;
  const plans = buildExportPlans();

  const startExport = (plan: ExportPlan) => {
    setMenuOpen(false);
    let printTarget: PrintTarget;
    try {
      printTarget = openPrintTarget(plan.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không mở được tài liệu in";
      document.dispatchEvent(new CustomEvent("mednote:pdf-export-error", { detail: { message } }));
      window.alert(`Không thể xuất PDF: ${message}`);
      return;
    }

    setProgress({ page: 0, total: plan.pageIndices.length, scope: plan.scope });
    void exportPlanToPdf(plan, printTarget, (page, total) => setProgress({ page, total, scope: plan.scope }))
      .catch((error) => {
        printTarget.cleanup();
        const message = error instanceof Error ? error.message : "Không thể xuất PDF";
        document.dispatchEvent(new CustomEvent("mednote:pdf-export-error", { detail: { message } }));
        window.alert(`Không thể xuất PDF: ${message}`);
      })
      .finally(() => setProgress(null));
  };

  return createPortal(
    <div className="note-pdf-export-wrap" ref={wrapperRef}>
      <button
        className="note-create-button note-pdf-export-button"
        disabled={exporting || !plans.length}
        onClick={() => setMenuOpen((open) => !open)}
        title="Xuất PDF theo Notebook, Section, Page hoặc Sheet"
        aria-label="Xuất note thành PDF"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <FileDown size={16} />
        <span>{exporting ? `PDF ${progress.page}/${progress.total}` : "Xuất PDF"}</span>
        {!exporting && <ChevronDown size={13} />}
      </button>
      {menuOpen && !exporting && (
        <div className="note-pdf-export-menu" role="menu" aria-label="Chọn phạm vi xuất PDF">
          <div className="note-pdf-export-menu-title">Xuất PDF</div>
          {plans.map((plan) => (
            <button key={plan.scope} type="button" role="menuitem" onClick={() => startExport(plan)} disabled={!plan.pageIndices.length}>
              <strong>{plan.title}</strong>
              <small>{plan.detail}</small>
            </button>
          ))}
        </div>
      )}
    </div>,
    target,
  );
}
