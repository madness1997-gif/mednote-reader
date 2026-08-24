import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { estimateNoteSheetFrameHeight, NoteSheetPreview, type NoteSheetPreviewProps } from "./note-sheet-preview";

type SlotState = { listener: (visible: boolean) => void };

class NoteSheetObserverPool {
  private readonly slots = new Map<Element, SlotState>();
  private readonly observer: IntersectionObserver;

  constructor(private readonly root: Element) {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => this.slots.get(entry.target)?.listener(entry.isIntersecting));
    }, { root, rootMargin: "1400px 0px" });
  }

  observe(element: Element, listener: (visible: boolean) => void) {
    this.slots.set(element, { listener });
    this.observer.observe(element);
    return () => {
      this.observer.unobserve(element);
      this.slots.delete(element);
      if (this.slots.size) return;
      this.observer.disconnect();
      observerPools.delete(this.root);
    };
  }
}

const observerPools = new WeakMap<Element, NoteSheetObserverPool>();
const measuredHeights = new Map<string, number>();

function observeNoteSheet(element: Element, root: Element, listener: (visible: boolean) => void) {
  let pool = observerPools.get(root);
  if (!pool) {
    pool = new NoteSheetObserverPool(root);
    observerPools.set(root, pool);
  }
  return pool.observe(element, listener);
}

export function VirtualizedNoteSheetPreview({
  rootRef,
  initiallyMounted,
  ...previewProps
}: NoteSheetPreviewProps & {
  rootRef: RefObject<HTMLDivElement | null>;
  initiallyMounted: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const estimate = estimateNoteSheetFrameHeight(previewProps.note, previewProps.zoom);
  const [mounted, setMounted] = useState(initiallyMounted);
  const [measuredHeight, setMeasuredHeight] = useState(() => measuredHeights.get(previewProps.note.id) ?? estimate);

  useEffect(() => {
    const slot = slotRef.current;
    const root = rootRef.current;
    if (!slot || !root) return;
    return observeNoteSheet(slot, root, setMounted);
  }, [rootRef, previewProps.note.id]);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!mounted || !slot) return;
    const measure = () => {
      const height = slot.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height < 40) return;
      measuredHeights.set(previewProps.note.id, height);
      setMeasuredHeight((current) => Math.abs(current - height) > 1 ? height : current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mounted, previewProps.note.id, previewProps.note.paper, previewProps.zoom]);

  return (
    <div
      ref={slotRef}
      className="note-sheet-virtual-slot"
      data-note-virtual-sheet={previewProps.note.id}
      data-note-virtual-mounted={mounted ? "true" : "false"}
      style={mounted ? undefined : { height: measuredHeight }}
    >
      {mounted
        ? <NoteSheetPreview {...previewProps} />
        : <div className="note-sheet-virtual-placeholder" aria-hidden="true"><span>Tờ {previewProps.sheetNumber}</span></div>}
    </div>
  );
}
