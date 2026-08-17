export type PdfWorkPriority = "visible" | "interactive" | "nearby" | "secondary" | "thumbnail";

const priorityValue: Record<PdfWorkPriority, number> = {
  visible: 0,
  interactive: 1,
  nearby: 2,
  secondary: 3,
  thumbnail: 4,
};

type QueueEntry<T> = {
  id: number;
  priority: PdfWorkPriority;
  run: (signal: AbortSignal) => Promise<T>;
  controller: AbortController;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  started: boolean;
  cancelled: boolean;
  preempted: boolean;
};

export type ScheduledPdfWork<T> = {
  promise: Promise<T>;
  cancel: () => void;
};

function abortError() {
  return new DOMException("PDF work cancelled", "AbortError");
}

export class PdfWorkScheduler {
  private queue: QueueEntry<unknown>[] = [];
  private active: QueueEntry<unknown> | null = null;
  private nextId = 0;

  schedule<T>(priority: PdfWorkPriority, run: (signal: AbortSignal) => Promise<T>): ScheduledPdfWork<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    const entry: QueueEntry<T> = {
      id: ++this.nextId,
      priority,
      run,
      controller: new AbortController(),
      resolve,
      reject,
      started: false,
      cancelled: false,
      preempted: false,
    };
    this.queue.push(entry as QueueEntry<unknown>);
    this.queue.sort((left, right) => priorityValue[left.priority] - priorityValue[right.priority] || left.id - right.id);

    // A page that has just entered the real viewport should not wait behind a
    // speculative neighbouring page or a thumbnail. PDF.js render tasks observe
    // this signal and release the lane quickly.
    if (priority === "visible" && this.active && priorityValue[this.active.priority] > priorityValue.visible) {
      this.active.preempted = true;
      this.active.controller.abort();
    }
    this.pump();

    return {
      promise,
      cancel: () => {
        if (entry.cancelled) return;
        entry.cancelled = true;
        entry.preempted = false;
        entry.controller.abort();
        if (!entry.started) {
          this.queue = this.queue.filter((queued) => queued !== entry);
          entry.reject(abortError());
        }
      },
    };
  }

  snapshot() {
    return {
      active: this.active ? { id: this.active.id, priority: this.active.priority } : null,
      queued: this.queue.map(({ id, priority }) => ({ id, priority })),
    };
  }

  private pump() {
    if (this.active) return;
    const entry = this.queue.shift();
    if (!entry) return;
    if (entry.controller.signal.aborted) {
      entry.reject(abortError());
      this.pump();
      return;
    }

    entry.started = true;
    this.active = entry;
    void entry.run(entry.controller.signal).then(
      (value) => entry.resolve(value),
      (error) => {
        if (entry.preempted && !entry.cancelled) {
          entry.preempted = false;
          entry.started = false;
          entry.controller = new AbortController();
          this.queue.push(entry);
          this.queue.sort((left, right) => priorityValue[left.priority] - priorityValue[right.priority] || left.id - right.id);
          return;
        }
        entry.reject(error);
      },
    ).finally(() => {
      if (this.active === entry) this.active = null;
      this.pump();
    });
  }
}

export function scheduleIdleWork(callback: () => void, timeout = 900) {
  let cancelled = false;
  if (typeof window === "undefined") {
    queueMicrotask(() => { if (!cancelled) callback(); });
    return () => { cancelled = true; };
  }

  const requestIdle = globalThis.requestIdleCallback;
  if (typeof requestIdle === "function") {
    const idleId = requestIdle(() => { if (!cancelled) callback(); }, { timeout });
    return () => {
      cancelled = true;
      globalThis.cancelIdleCallback(idleId);
    };
  }

  const timer = globalThis.setTimeout(() => { if (!cancelled) callback(); }, Math.min(timeout, 48));
  return () => {
    cancelled = true;
    globalThis.clearTimeout(timer);
  };
}

export function waitForIdleWork(timeout = 900) {
  return new Promise<void>((resolve) => scheduleIdleWork(resolve, timeout));
}

export const pdfWorkScheduler = new PdfWorkScheduler();
