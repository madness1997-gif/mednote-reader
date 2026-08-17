import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFiumDocument } from "./pdfium-renderer";
import { waitForIdleWork } from "./pdf-work-scheduler";

export type PdfReaderStatus = "idle" | "loading" | "ready" | "error";
export type PdfOutlineEntry = { title: string; page: number | null; depth: number };
export type PdfReaderSession = {
  documentId: string;
  lastModified: number;
  pdf: PDFDocumentProxy;
  pdfium: PDFiumDocument | null;
  outline: PdfOutlineEntry[];
};

export type PdfSearchTarget = {
  id: string;
  name: string;
  lastModified: number;
  blob?: Blob;
  proxy?: PDFDocumentProxy | null;
};

export type PdfSearchResult = {
  documentId: string;
  documentName: string;
  page: number;
  snippet: string;
  occurrences: number;
};

type LoadPdf = (source: Uint8Array | Blob) => Promise<PDFDocumentProxy>;
type LoadPdfium = (data: Uint8Array) => Promise<PDFiumDocument>;
type WaitForSecondaryWork = () => Promise<void>;
type PdfReaderListener = (state: ReturnType<PdfReaderController["getState"]>) => void;

export type PdfReaderControllerDependencies = {
  loadPdf?: LoadPdf;
  loadPdfium?: LoadPdfium;
  readBlob?: (id: string) => Promise<Blob | null>;
  waitForSecondaryWork?: WaitForSecondaryWork;
};

const defaultLoadPdf: LoadPdf = async (source) => (await import("./pdf-document-loader")).loadPdfDocument(source);
const defaultLoadPdfium: LoadPdfium = async (data) => (await import("./pdfium-renderer")).loadPdfiumDocument(data);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

export function clampPdfPage(page: number, numPages: number) {
  return Math.round(clamp(page, 1, Math.max(1, numPages)));
}

export function clampPdfZoom(zoom: number) {
  return clamp(zoom, .55, 2.5);
}

export function nextContinuousPage(current: number, direction: -1 | 1, numPages: number) {
  return clampPdfPage(current + direction, numPages);
}

export function zoomAroundAnchor(
  oldZoom: number,
  nextZoom: number,
  anchor: { contentX: number; contentY: number; localX: number; localY: number },
) {
  const ratio = clampPdfZoom(nextZoom) / Math.max(.0001, clampPdfZoom(oldZoom));
  return {
    left: Math.max(0, anchor.contentX * ratio - anchor.localX),
    top: Math.max(0, anchor.contentY * ratio - anchor.localY),
  };
}

async function resolveOutline(pdf: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const result: PdfOutlineEntry[] = [];

  const visit = async (items: any[], depth: number) => {
    for (const item of items) {
      let page: number | null = null;
      try {
        let destination: any = item.dest;
        if (typeof destination === "string") destination = await pdf.getDestination(destination);
        const ref = Array.isArray(destination) ? destination[0] : null;
        if (ref) page = (await pdf.getPageIndex(ref)) + 1;
      } catch {
        page = null;
      }
      result.push({ title: String(item.title || "Mục lục"), page, depth });
      if (Array.isArray(item.items) && item.items.length) await visit(item.items, depth + 1);
    }
  };

  await visit(outline as any[], 0);
  return result;
}

function textOf(content: any) {
  return (content.items || [])
    .map((item: any) => typeof item.str === "string" ? item.str : "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(haystack: string, needle: string) {
  const source = haystack.toLocaleLowerCase();
  const query = needle.toLocaleLowerCase();
  let count = 0;
  let index = 0;
  while (query && (index = source.indexOf(query, index)) >= 0) {
    count += 1;
    index += Math.max(1, query.length);
  }
  return count;
}

export class PdfReaderController {
  private readonly loadPdf: LoadPdf;
  private readonly loadPdfium: LoadPdfium;
  private readonly readBlob?: (id: string) => Promise<Blob | null>;
  private readonly waitForSecondaryWork: WaitForSecondaryWork;
  private generation = 0;
  private session: PdfReaderSession | null = null;
  private pendingSecondary: {
    generation: number;
    session: PdfReaderSession;
    blob: Blob;
    started: boolean;
    fallbackTimer?: number;
  } | null = null;
  private status: PdfReaderStatus = "idle";
  private error: Error | null = null;
  private readonly textCache = new Map<string, Map<number, string>>();
  private readonly listeners = new Set<PdfReaderListener>();

  constructor(dependencies: PdfReaderControllerDependencies = {}) {
    this.loadPdf = dependencies.loadPdf || defaultLoadPdf;
    this.loadPdfium = dependencies.loadPdfium || defaultLoadPdfium;
    this.readBlob = dependencies.readBlob;
    this.waitForSecondaryWork = dependencies.waitForSecondaryWork || (() => waitForIdleWork(1_200));
  }

  getState() {
    return { status: this.status, error: this.error, session: this.session };
  }

  subscribe(listener: PdfReaderListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  selectDocumentTarget<T extends { id: string; reader?: { page?: number } }>(documents: T[], documentId: string, requestedPage?: number) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return null;
    return { document, page: Math.max(1, Math.round(requestedPage ?? document.reader?.page ?? 1)) };
  }

  async close() {
    this.generation += 1;
    this.clearPendingSecondary();
    const old = this.session;
    this.session = null;
    this.status = "idle";
    this.error = null;
    this.emit();
    if (old) await Promise.allSettled([old.pdf.destroy(), old.pdfium?.destroy?.()]);
  }

  async open(input: { documentId: string; lastModified: number; blob: Blob }): Promise<PdfReaderSession | null> {
    const generation = ++this.generation;
    this.clearPendingSecondary();
    const previous = this.session;
    this.session = null;
    this.status = "loading";
    this.error = null;
    this.emit();
    if (previous) void Promise.allSettled([previous.pdf.destroy(), previous.pdfium?.destroy?.()]);

    let pdf: PDFDocumentProxy;
    try {
      // Blob-backed PDF.js loading can stream into its worker. Converting the
      // entire file to bytes here made opening a large textbook an all-or-
      // nothing operation and duplicated its memory before page 1 was visible.
      pdf = await this.loadPdf(input.blob);
    } catch (error) {
      if (generation === this.generation) {
        this.status = "error";
        this.error = error instanceof Error ? error : new Error(String(error));
        this.emit();
      }
      throw error;
    }

    if (generation !== this.generation) {
      await pdf.destroy();
      return null;
    }

    const session: PdfReaderSession = {
      documentId: input.documentId,
      lastModified: input.lastModified,
      pdf,
      pdfium: null,
      outline: [],
    };
    this.session = session;
    this.status = "ready";
    this.emit();

    this.pendingSecondary = { generation, session, blob: input.blob, started: false };
    // A hidden Reader may never paint. In that case secondary facilities still
    // become available, but only after the initial open path has had ample time.
    if (typeof window !== "undefined") {
      this.pendingSecondary.fallbackTimer = window.setTimeout(() => {
        this.startSecondaryWork(session.documentId);
      }, 4_000);
    }

    return session;
  }

  notifyVisiblePageRendered(documentId: string) {
    this.startSecondaryWork(documentId);
  }

  resolveOutline(pdf = this.session?.pdf) {
    return pdf ? resolveOutline(pdf) : Promise.resolve([]);
  }

  private clearPendingSecondary() {
    if (this.pendingSecondary?.fallbackTimer) clearTimeout(this.pendingSecondary.fallbackTimer);
    this.pendingSecondary = null;
  }

  private startSecondaryWork(documentId: string) {
    const pending = this.pendingSecondary;
    if (!pending || pending.started || pending.session.documentId !== documentId) return;
    pending.started = true;
    if (pending.fallbackTimer) clearTimeout(pending.fallbackTimer);
    void this.runSecondaryWork(pending);
  }

  private async runSecondaryWork(pending: NonNullable<PdfReaderController["pendingSecondary"]>) {
    const current = () => pending.generation === this.generation && this.session === pending.session;
    try {
      await this.waitForSecondaryWork();
      if (!current()) return;
      const outline = await resolveOutline(pending.session.pdf).catch(() => []);
      if (!current()) return;
      pending.session.outline = outline;
      this.emit();

      // PDFium improves fidelity for difficult files, but loading its WASM and
      // copying a whole Blob must never compete with the first visible bitmap.
      await this.waitForSecondaryWork();
      if (!current()) return;
      const bytes = new Uint8Array(await pending.blob.arrayBuffer());
      if (!current()) return;
      const pdfium = await this.loadPdfium(bytes);
      if (!current()) {
        await pdfium.destroy();
        return;
      }
      pending.session.pdfium = pdfium;
      this.emit();
    } catch {
      // The PDF.js session is already usable; outline/PDFium are optional.
    } finally {
      if (this.pendingSecondary === pending) this.pendingSecondary = null;
    }
  }

  clampPage(page: number, numPages = this.session?.pdf.numPages || 1) {
    return clampPdfPage(page, numPages);
  }

  clampZoom(zoom: number) {
    return clampPdfZoom(zoom);
  }

  async search(
    query: string,
    targets: PdfSearchTarget[],
    options: { signal?: AbortSignal; concurrency?: number; maxResults?: number } = {},
  ): Promise<PdfSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const maxResults = options.maxResults || 300;
    const concurrency = Math.max(1, Math.min(4, options.concurrency || 3));
    const results: PdfSearchResult[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < targets.length && results.length < maxResults) {
        if (options.signal?.aborted) throw new DOMException("Search aborted", "AbortError");
        const target = targets[cursor++];
        let proxy = target.proxy || null;
        let temporary = false;
        try {
          if (!proxy) {
            const blob = target.blob || await this.readBlob?.(target.id);
            if (!blob) continue;
            proxy = await this.loadPdf(blob);
            temporary = true;
          }
          const cacheKey = `${target.id}:${target.lastModified}`;
          let cache = this.textCache.get(cacheKey);
          if (!cache) {
            cache = new Map();
            this.textCache.set(cacheKey, cache);
          }
          for (let page = 1; page <= proxy.numPages && results.length < maxResults; page += 1) {
            if (options.signal?.aborted) throw new DOMException("Search aborted", "AbortError");
            let text = cache.get(page);
            if (text === undefined) {
              const loadedText = textOf(await (await proxy.getPage(page)).getTextContent());
              cache.set(page, loadedText);
              text = loadedText;
            }
            if (text === undefined) continue;
            const occurrences = countOccurrences(text, trimmed);
            if (!occurrences) continue;
            const lowered = text.toLocaleLowerCase();
            const foundAt = lowered.indexOf(trimmed.toLocaleLowerCase());
            const from = Math.max(0, foundAt - 70);
            const to = Math.min(text.length, foundAt + trimmed.length + 110);
            results.push({
              documentId: target.id,
              documentName: target.name,
              page,
              snippet: `${from ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`,
              occurrences,
            });
          }
        } finally {
          if (temporary && proxy) await proxy.destroy().catch(() => undefined);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    return results.slice(0, maxResults);
  }
}
