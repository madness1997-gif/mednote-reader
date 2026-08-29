"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PdfAnnotation, PdfRect } from "./pdf-domain";
import {
  PDF_CONTINUOUS_ESTIMATED_HEIGHT,
  PDF_CONTINUOUS_OVERSCAN,
  nearestPdfVirtualPageIndex,
  pdfPageVirtualMetrics,
  pdfPageVirtualRange,
} from "./pdf-page-virtualizer";
import { LazyPdfPageView, type PdfPageViewProps } from "./pdf-reader";

export type PdfContinuousScrollAnchor = { page: number; offset: number };

export type VirtualizedPdfPagesHandle = {
  getScrollAnchor: (inset?: number) => PdfContinuousScrollAnchor | null;
  pinScrollAnchor: () => void;
  scrollToPage: (page: number, smooth?: boolean) => void;
};

type VirtualizedPdfPagesProps = Omit<
  PdfPageViewProps,
  "page" | "fitMode" | "continuous" | "interactive" | "renderPriority" | "sourceFocus" | "onAnnotationCommit"
> & {
  documentKey: string;
  initialPage: number;
  pages: number[];
  rootRef: RefObject<HTMLDivElement | null>;
  sourceFocus?: { page: number; rect: PdfRect } | null;
  onAnnotationCommit: (page: number, next: PdfAnnotation[], previous: PdfAnnotation[]) => void;
};

type PendingAnchor = { page: number; offset: number };

export const VirtualizedPdfPages = forwardRef<VirtualizedPdfPagesHandle, VirtualizedPdfPagesProps>(function VirtualizedPdfPages({
  documentKey,
  initialPage,
  pages,
  rootRef,
  sourceFocus,
  onAnnotationCommit,
  document,
  rotation,
  zoom,
  ...pageProps
}, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measuredHeightsRef = useRef(new Map<number, number>());
  const layoutKeyRef = useRef(`${documentKey}:${rotation}:${zoom}`);
  const pendingAnchorRef = useRef<PendingAnchor | null>(null);
  const pinnedAnchorRef = useRef<PendingAnchor | null>(null);
  const pinnedAnchorTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const metricsRef = useRef(pdfPageVirtualMetrics(pages, measuredHeightsRef.current));
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [estimatedHeight, setEstimatedHeight] = useState(PDF_CONTINUOUS_ESTIMATED_HEIGHT);
  const estimatedHeightRef = useRef(estimatedHeight);
  const initialIndex = Math.max(0, pages.indexOf(initialPage));
  const [range, setRange] = useState(() => ({
    start: Math.max(0, initialIndex - 2),
    end: Math.min(pages.length, initialIndex + 3),
  }));

  const layoutKey = `${documentKey}:${rotation}:${zoom}`;
  estimatedHeightRef.current = estimatedHeight;
  if (layoutKeyRef.current !== layoutKey) {
    layoutKeyRef.current = layoutKey;
    measuredHeightsRef.current = new Map();
  }

  const metrics = useMemo(
    () => pdfPageVirtualMetrics(pages, measuredHeightsRef.current, estimatedHeight),
    [estimatedHeight, layoutKey, measurementVersion, pages],
  );
  metricsRef.current = metrics;

  const viewportTop = useCallback((inset = 0) => {
    const stage = rootRef.current;
    const host = hostRef.current;
    if (!stage || !host) return 0;
    return Math.max(0, stage.getBoundingClientRect().top + inset - host.getBoundingClientRect().top);
  }, [rootRef]);

  const getScrollAnchor = useCallback((inset = 0): PdfContinuousScrollAnchor | null => {
    if (pinnedAnchorRef.current) return pinnedAnchorRef.current;
    const stage = rootRef.current;
    const host = hostRef.current;
    const currentMetrics = metricsRef.current;
    if (!stage || !host || !pages.length) return null;
    const index = nearestPdfVirtualPageIndex(currentMetrics, viewportTop(inset));
    if (index < 0) return null;
    return {
      page: pages[index],
      offset: host.getBoundingClientRect().top + currentMetrics.offsets[index] - stage.getBoundingClientRect().top,
    };
  }, [pages, rootRef, viewportTop]);

  const updateRange = useCallback(() => {
    const stage = rootRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;
    const currentMetrics = metricsRef.current;
    const next = pdfPageVirtualRange(currentMetrics, viewportTop(), stage.clientHeight, PDF_CONTINUOUS_OVERSCAN);
    setRange((current) => current.start === next.start && current.end === next.end ? current : next);
    const anchorIndex = nearestPdfVirtualPageIndex(currentMetrics, viewportTop(24));
    if (anchorIndex >= 0) host.dataset.pdfVirtualAnchorPage = String(pages[anchorIndex]);
  }, [pages, rootRef, viewportTop]);

  const queueRangeUpdate = useCallback(() => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateRange();
    });
  }, [updateRange]);

  const capturePendingAnchor = useCallback(() => {
    const anchor = pinnedAnchorRef.current ?? getScrollAnchor();
    if (anchor) pendingAnchorRef.current = anchor;
  }, [getScrollAnchor]);

  const pinScrollAnchor = useCallback(() => {
    const anchor = getScrollAnchor();
    if (!anchor) return;
    pinnedAnchorRef.current = anchor;
    pendingAnchorRef.current = anchor;
    if (pinnedAnchorTimerRef.current !== null) window.clearTimeout(pinnedAnchorTimerRef.current);
    pinnedAnchorTimerRef.current = window.setTimeout(() => {
      pinnedAnchorRef.current = null;
      pinnedAnchorTimerRef.current = null;
    }, 1_500);
  }, [getScrollAnchor]);

  const scrollToPage = useCallback((page: number, smooth = true) => {
    const stage = rootRef.current;
    const host = hostRef.current;
    const currentMetrics = metricsRef.current;
    if (!stage || !host || !pages.length) return;
    const index = Math.max(0, Math.min(pages.length - 1, pages.indexOf(page)));
    const listTop = stage.scrollTop + host.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    const top = listTop + currentMetrics.offsets[index];
    const nextRange = pdfPageVirtualRange(currentMetrics, currentMetrics.offsets[index], stage.clientHeight, PDF_CONTINUOUS_OVERSCAN);
    setRange(nextRange);
    const useSmoothScroll = smooth && Math.abs(top - stage.scrollTop) <= stage.clientHeight * 4;
    stage.scrollTo({ top, behavior: useSmoothScroll ? "smooth" : "auto" });
    queueRangeUpdate();
  }, [pages, queueRangeUpdate, rootRef]);

  useImperativeHandle(forwardedRef, () => ({ getScrollAnchor, pinScrollAnchor, scrollToPage }), [getScrollAnchor, pinScrollAnchor, scrollToPage]);

  useLayoutEffect(() => {
    const pending = pendingAnchorRef.current;
    const stage = rootRef.current;
    const host = hostRef.current;
    if (!pending || !stage || !host) return;
    pendingAnchorRef.current = null;
    const index = pages.indexOf(pending.page);
    if (index < 0) return;
    const nextOffset = host.getBoundingClientRect().top + metrics.offsets[index] - stage.getBoundingClientRect().top;
    stage.scrollTop += nextOffset - pending.offset;
    updateRange();
  }, [metrics, pages, rootRef, updateRange]);

  useLayoutEffect(() => {
    scrollToPage(initialPage, false);
  }, [documentKey, rotation]);

  useEffect(() => {
    const stage = rootRef.current;
    if (!stage) return;
    const onScroll = () => queueRangeUpdate();
    stage.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(queueRangeUpdate);
    observer.observe(stage);
    queueRangeUpdate();
    return () => {
      stage.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
      if (pinnedAnchorTimerRef.current !== null) window.clearTimeout(pinnedAnchorTimerRef.current);
    };
  }, [queueRangeUpdate, rootRef]);

  useEffect(() => {
    const stage = rootRef.current;
    if (!stage || !pages.length) return;
    let disposed = false;
    let baseSize: { width: number; height: number } | null = null;
    const applyEstimate = () => {
      if (disposed || !baseSize || !stage.clientWidth || !stage.clientHeight) return;
      const style = window.getComputedStyle(stage);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const availableWidth = Math.max(280, stage.clientWidth - horizontalPadding - 2);
      const next = Math.max(260, baseSize.height * (availableWidth / baseSize.width) * zoom + 23);
      if (Math.abs(estimatedHeightRef.current - next) <= 1) return;
      capturePendingAnchor();
      measuredHeightsRef.current = new Map();
      estimatedHeightRef.current = next;
      setEstimatedHeight(next);
      setMeasurementVersion((version) => version + 1);
    };
    void document.getPage(pages[0]).then((pdfPage) => {
      if (disposed) return;
      const viewport = pdfPage.getViewport({ scale: 1, rotation });
      baseSize = { width: viewport.width, height: viewport.height };
      applyEstimate();
    }).catch(() => undefined);
    const observer = new ResizeObserver(applyEstimate);
    observer.observe(stage);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [capturePendingAnchor, document, layoutKey, pages, rootRef, rotation, zoom]);

  const updateMeasuredHeight = useCallback((page: number, height: number) => {
    const normalized = Math.max(260, height);
    const current = measuredHeightsRef.current.get(page);
    if (current !== undefined && Math.abs(current - normalized) <= 1) return;
    capturePendingAnchor();
    measuredHeightsRef.current.set(page, normalized);
    setMeasurementVersion((version) => version + 1);
  }, [capturePendingAnchor]);

  return (
    <div
      ref={hostRef}
      className="continuous-pages"
      data-pdf-virtualized="true"
      data-pdf-total-pages={pages.length}
      style={{ height: metrics.totalHeight, ...(zoom > 1 ? { width: `${zoom * 100}%` } : {}) }}
    >
      {pages.slice(range.start, range.end).map((page, visibleIndex) => {
        const index = range.start + visibleIndex;
        return (
          <div
            className="virtual-pdf-page-slot"
            data-pdf-virtual-slot={page}
            key={`${documentKey}-${page}-${rotation}`}
            style={{ top: metrics.offsets[index], minHeight: metrics.heights[index] }}
          >
            <LazyPdfPageView
              {...pageProps}
              document={document}
              page={page}
              zoom={zoom}
              fitMode="width"
              rotation={rotation}
              estimatedHeight={metrics.heights[index]}
              onHeightChange={updateMeasuredHeight}
              sourceFocus={sourceFocus?.page === page ? sourceFocus.rect : null}
              onAnnotationCommit={(next, previous) => onAnnotationCommit(page, next, previous)}
            />
          </div>
        );
      })}
    </div>
  );
});
