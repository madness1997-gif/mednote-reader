export const WINDOWS_PDF_CANVAS_BUDGET_BYTES = 192 * 1024 * 1024;

type PdfCanvasBudgetEntry = {
  bytes: number;
  lastUsed: number;
  evict: () => void;
  pinned: () => boolean;
};

export type PdfCanvasBudgetSnapshot = {
  budgetBytes: number;
  totalBytes: number;
  entries: Array<{ key: string; bytes: number; lastUsed: number; pinned: boolean }>;
};

export class PdfCanvasBudgetManager {
  private readonly entries = new Map<string, PdfCanvasBudgetEntry>();
  private clock = 0;

  constructor(readonly budgetBytes = WINDOWS_PDF_CANVAS_BUDGET_BYTES) {}

  report(key: string, bytes: number, evict: () => void, pinned: () => boolean = () => false) {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    this.entries.set(key, {
      bytes: normalizedBytes,
      lastUsed: ++this.clock,
      evict,
      pinned,
    });
    this.enforceBudget(key);
  }

  touch(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.lastUsed = ++this.clock;
  }

  remove(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  snapshot(): PdfCanvasBudgetSnapshot {
    const entries = Array.from(this.entries, ([key, entry]) => ({
      key,
      bytes: entry.bytes,
      lastUsed: entry.lastUsed,
      pinned: safePinned(entry),
    }));
    return {
      budgetBytes: this.budgetBytes,
      totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
      entries,
    };
  }

  private enforceBudget(protectedKey: string) {
    let totalBytes = this.totalBytes();
    if (totalBytes <= this.budgetBytes) return;

    const candidates = Array.from(this.entries.entries())
      .filter(([key, entry]) => key !== protectedKey && !safePinned(entry))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);

    for (const [key, entry] of candidates) {
      if (totalBytes <= this.budgetBytes) break;
      // Remove first so React cleanup or a synchronous report cannot evict the
      // same page twice while the callback is unmounting its canvases.
      this.entries.delete(key);
      totalBytes -= entry.bytes;
      try {
        entry.evict();
      } catch {
        // A failed eviction callback must never break PDF rendering. The entry
        // is already forgotten and will be reported again if it remains alive.
      }
    }
  }

  private totalBytes() {
    let total = 0;
    this.entries.forEach((entry) => {
      total += entry.bytes;
    });
    return total;
  }
}

function safePinned(entry: PdfCanvasBudgetEntry) {
  try {
    return entry.pinned();
  } catch {
    return false;
  }
}

export const desktopPdfCanvasBudget = new PdfCanvasBudgetManager();
