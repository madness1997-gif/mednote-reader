import type { PDFDocumentProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { pdfWorkScheduler, scheduleIdleWork, type ScheduledPdfWork } from "./pdf-work-scheduler";

const DEFAULT_PDF_ITEM_SIZE = 142;
const OVERSCAN_ITEMS = 2;

type VirtualRange = { start: number; end: number };

type VirtualWindow = {
  listRef: RefObject<HTMLDivElement | null>;
  range: VirtualRange;
  itemSize: number;
  topSpacer: number;
  bottomSpacer: number;
};

function scrollMetrics(list: HTMLDivElement, itemSize: number) {
  const container = list.parentElement;
  if (!container) return null;
  const containerRect = container.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const listTop = listRect.top - containerRect.top + container.scrollTop;
  const viewportTop = Math.max(0, container.scrollTop - listTop);
  return { container, listTop, viewportTop, viewportHeight: container.clientHeight, itemSize };
}

function useVirtualWindow(total: number, activeIndex: number, defaultItemSize: number): VirtualWindow {
  const listRef = useRef<HTMLDivElement>(null);
  const [itemSize, setItemSize] = useState(defaultItemSize);
  const [range, setRange] = useState<VirtualRange>(() => ({ start: 0, end: Math.min(total, 18) }));

  const updateRange = useCallback(() => {
    const list = listRef.current;
    if (!list || total <= 0) {
      setRange({ start: 0, end: 0 });
      return;
    }
    const metrics = scrollMetrics(list, itemSize);
    if (!metrics) return;
    const firstVisible = Math.floor(metrics.viewportTop / itemSize);
    const visibleCount = Math.max(1, Math.ceil(metrics.viewportHeight / itemSize));
    const start = Math.max(0, firstVisible - OVERSCAN_ITEMS);
    const end = Math.min(total, firstVisible + visibleCount + OVERSCAN_ITEMS + 1);
    setRange((current) => current.start === start && current.end === end ? current : { start, end });
  }, [itemSize, total]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const container = list?.parentElement;
    if (!list || !container) return;

    let frame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateRange);
    };
    const measure = () => {
      const sample = list.querySelector<HTMLElement>("[data-virtual-item]");
      if (sample) {
        const measured = sample.getBoundingClientRect().height;
        if (Number.isFinite(measured) && measured > 24) {
          setItemSize((current) => Math.abs(current - measured) > 1 ? measured : current);
        }
      }
      scheduleUpdate();
    };

    container.addEventListener("scroll", scheduleUpdate, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(list);
    frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", scheduleUpdate);
      observer.disconnect();
    };
  }, [range.start, range.end, updateRange]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= total) return;
    const list = listRef.current;
    if (!list) return;
    const metrics = scrollMetrics(list, itemSize);
    if (!metrics) return;
    const itemTop = metrics.listTop + activeIndex * itemSize;
    const itemBottom = itemTop + itemSize;
    const viewTop = metrics.container.scrollTop;
    const viewBottom = viewTop + metrics.container.clientHeight;
    if (itemTop >= viewTop && itemBottom <= viewBottom) return;
    const target = itemTop - Math.max(0, (metrics.container.clientHeight - itemSize) * 0.35);
    metrics.container.scrollTop = Math.max(0, target);
    updateRange();
  }, [activeIndex, itemSize, total, updateRange]);

  return {
    listRef,
    range,
    itemSize,
    topSpacer: range.start * itemSize,
    bottomSpacer: Math.max(0, (total - range.end) * itemSize),
  };
}

function PdfThumbnail({ document, page, active, onClick }: { document: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let disposed = false;
    let task: PDFRenderTask | null = null;
    let scheduled: ScheduledPdfWork<void> | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cancelIdle = scheduleIdleWork(() => {
      scheduled = pdfWorkScheduler.schedule("thumbnail", async (signal) => {
        const pdfPage = await document.getPage(page);
        if (disposed || signal.aborted || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: 72 / base.width });
        const target = canvasRef.current;
        if (!target) return;
        const ratio = 1.25;
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        const context = target.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        task = pdfPage.render({ canvas: target, canvasContext: context, viewport });
        const cancel = () => task?.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        try {
          await task.promise;
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      });
      void scheduled.promise.catch(() => undefined);
    }, 1_200);

    return () => {
      disposed = true;
      cancelIdle();
      scheduled?.cancel();
      task?.cancel();
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [document, page]);

  return (
    <button className={`pdf-thumb ${active ? "active" : ""}`} style={{ width: "100%" }} onClick={onClick}>
      <span className="mini-paper pdf-mini"><canvas ref={canvasRef} /></span>
      <span>{page}</span>
    </button>
  );
}

function PdfPlaceholderThumbnail({ page, active, onClick }: { page: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`pdf-thumb ${active ? "active" : ""}`} style={{ width: "100%" }} onClick={onClick}>
      <span className="mini-paper"><i /><i /><i /><i className="wide" /><b /></span>
      <span>{page}</span>
    </button>
  );
}

export function VirtualPdfThumbnailList({
  pages,
  document,
  activeDocumentId,
  activePage,
  onPageClick,
}: {
  pages: number[];
  document: PDFDocumentProxy | null;
  activeDocumentId: string | null;
  activePage: number;
  onPageClick: (page: number) => void;
}) {
  const activeIndex = pages.indexOf(activePage);
  const virtual = useVirtualWindow(pages.length, activeIndex, DEFAULT_PDF_ITEM_SIZE);
  const visiblePages = pages.slice(virtual.range.start, virtual.range.end);

  return (
    <div
      ref={virtual.listRef}
      className="thumb-list virtual-thumb-list"
      data-virtual-total={pages.length}
      data-virtual-start={virtual.range.start}
      data-virtual-end={virtual.range.end}
      style={{ gap: 0, paddingTop: 4 }}
    >
      {virtual.topSpacer > 0 && <div aria-hidden="true" style={{ height: virtual.topSpacer }} />}
      {visiblePages.map((page) => (
        <div key={`${activeDocumentId ?? "demo"}-${page}`} data-virtual-item style={{ paddingBottom: 8 }}>
          {document ? (
            <PdfThumbnail document={document} page={page} active={page === activePage} onClick={() => onPageClick(page)} />
          ) : (
            <PdfPlaceholderThumbnail page={page} active={page === activePage} onClick={() => onPageClick(page)} />
          )}
        </div>
      ))}
      {virtual.bottomSpacer > 0 && <div aria-hidden="true" style={{ height: virtual.bottomSpacer }} />}
    </div>
  );
}
