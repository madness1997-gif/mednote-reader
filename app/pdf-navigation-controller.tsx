"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LibraryDocument, ReaderState, WorkspaceItem } from "./document-runtime-adapter";
import type { PdfAnnotation } from "./pdf-domain";
import type { PdfReaderController } from "./pdf-reader-controller";
import type { PdfOutlineEntry, PdfRailTab, SearchResult } from "./ui/ui-contracts";

type PdfNavigationIntegration = {
  reader: PdfReaderController;
  activeDocument: LibraryDocument | null;
  activeWorkspace: WorkspaceItem;
  currentDocument: PDFDocumentProxy | null;
  loadedDocumentId: string | null;
  sourcePage: number;
  sourcePages: number[];
  bookmarks: number[];
  annotations: PdfAnnotation[];
  goToPage: (page: number) => void;
  switchDocument: (documentId: string, page?: number) => void;
  updateReader: (updater: (reader: ReaderState) => ReaderState) => void;
  removeAnnotation: (annotationId: string) => void;
  notify: (message: string) => void;
};

export type PdfNavigationController = {
  activeDocument: LibraryDocument | null;
  activeWorkspace: WorkspaceItem;
  currentDocument: PDFDocumentProxy | null;
  sourcePage: number;
  sourcePages: number[];
  bookmarks: number[];
  annotations: PdfAnnotation[];
  railVisible: boolean;
  railTab: PdfRailTab;
  outline: PdfOutlineEntry[];
  query: string;
  activeQuery: string;
  searchWholeCollection: boolean;
  searchResults: SearchResult[];
  searching: boolean;
  setRailTab: (tab: PdfRailTab) => void;
  setQuery: (query: string) => void;
  setSearchWholeCollection: (enabled: boolean) => void;
  showRail: () => void;
  hideRail: () => void;
  openSearch: () => void;
  performSearch: () => Promise<void>;
  goToPage: (page: number) => void;
  switchDocument: (documentId: string) => void;
  openSearchResult: (result: SearchResult) => void;
  removeBookmark: (page: number) => void;
  removeAnnotation: (annotationId: string) => void;
};

export function pdfAnnotationLabel(annotation: PdfAnnotation) {
  const labels: Record<PdfAnnotation["kind"], string> = {
    highlight: "Tô sáng",
    "area-highlight": "Tô vùng",
    underline: "Gạch chân",
    strikeout: "Gạch ngang",
    squiggly: "Lượn sóng",
    ink: "Nét bút",
    note: "Ghi chú",
    text: "Chữ",
    rectangle: "Chữ nhật",
    ellipse: "Elip",
    arrow: "Mũi tên",
    stamp: "Con dấu",
    signature: "Chữ ký",
  };
  return labels[annotation.kind];
}

export function pdfAnnotationSummary(annotation: PdfAnnotation) {
  if (annotation.kind === "ink") return `${annotation.points.length} điểm bút`;
  if ("text" in annotation && annotation.text) return annotation.text;
  return pdfAnnotationLabel(annotation);
}

export function usePdfNavigationController(integration: PdfNavigationIntegration): PdfNavigationController {
  const integrationRef = useRef(integration);
  integrationRef.current = integration;
  const searchAbortRef = useRef<AbortController | null>(null);
  const [railVisible, setRailVisible] = useState(true);
  const [railTab, setRailTab] = useState<PdfRailTab>("outline");
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchWholeCollection, setSearchWholeCollection] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const goToPage = useCallback((page: number) => {
    integrationRef.current.goToPage(page);
    if (window.matchMedia("(max-width: 820px)").matches) setRailVisible(false);
  }, []);

  const openSearchResult = useCallback((result: SearchResult) => {
    const current = integrationRef.current;
    if (result.documentId && result.documentId !== current.activeDocument?.id) current.switchDocument(result.documentId, result.page);
    else goToPage(result.page);
    if (window.matchMedia("(max-width: 820px)").matches) setRailVisible(false);
    setRailTab("search");
  }, [goToPage]);

  const performSearch = useCallback(async () => {
    const searchQuery = query.trim();
    if (!searchQuery) {
      setSearchResults([]);
      setActiveQuery("");
      return;
    }
    searchAbortRef.current?.abort();
    const abort = new AbortController();
    searchAbortRef.current = abort;
    setSearching(true);
    setActiveQuery(searchQuery);
    setSearchResults([]);
    const current = integrationRef.current;
    const normalizedQuery = searchQuery.toLocaleLowerCase();
    if (!current.activeWorkspace.documents.length) {
      if (current.activeWorkspace.kind !== "demo") {
        setSearching(false);
        current.notify("Chưa có PDF để tìm kiếm");
        return;
      }
      const demoText = "Diabetic neuropathy pathophysiology hyperglycemia polyol pathway clinical features diagnosis management peripheral autonomic neuropathy";
      const matches = demoText.toLocaleLowerCase().includes(normalizedQuery)
        ? [{ documentId: null, documentName: "Tài liệu mẫu", page: 126, snippet: demoText, occurrences: 1 }]
        : [];
      if (!abort.signal.aborted) { setSearchResults(matches); setSearching(false); }
      return;
    }
    const targets = (searchWholeCollection ? current.activeWorkspace.documents : current.activeDocument ? [current.activeDocument] : []).map((target) => ({
      id: target.id,
      name: target.name,
      lastModified: target.lastModified,
      proxy: target.id === current.loadedDocumentId ? current.currentDocument : null,
    }));
    try {
      const found = await current.reader.search(searchQuery, targets, {
        signal: abort.signal,
        concurrency: window.matchMedia("(max-width: 820px)").matches ? 2 : 4,
        maxResults: 300,
      });
      if (abort.signal.aborted) return;
      setSearchResults(found);
      current.notify(found.length ? `Tìm thấy ở ${found.length} trang` : "Không tìm thấy kết quả");
    } catch (searchError) {
      if (!abort.signal.aborted && (searchError as Error).name !== "AbortError") current.notify("Không thể tìm kiếm PDF");
    } finally {
      if (searchAbortRef.current === abort) searchAbortRef.current = null;
      if (!abort.signal.aborted) setSearching(false);
    }
  }, [query, searchWholeCollection]);

  const openSearch = useCallback(() => {
    setRailVisible(true);
    setRailTab("search");
    window.setTimeout(() => document.getElementById("pdf-search-input")?.focus(), 0);
  }, []);

  const removeBookmark = useCallback((page: number) => {
    integrationRef.current.updateReader((reader) => ({ ...reader, bookmarks: reader.bookmarks.filter((item) => item !== page) }));
  }, []);

  useEffect(() => integration.reader.subscribe(({ session }) => {
    setOutline(session?.outline ?? []);
  }), [integration.reader]);

  useEffect(() => {
    if (integration.currentDocument) return;
    setOutline(integration.activeDocument || integration.activeWorkspace.kind !== "demo" ? [] : [
      { title: "3.4 Diabetic Neuropathy", page: 123, depth: 0 },
      { title: "Introduction", page: 123, depth: 1 },
      { title: "Pathophysiology", page: 126, depth: 1 },
      { title: "Clinical features", page: 127, depth: 1 },
    ]);
  }, [integration.activeDocument, integration.activeWorkspace.kind, integration.currentDocument]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, [integration.activeDocument?.id, query, searchWholeCollection]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) setRailVisible(false);
    return () => searchAbortRef.current?.abort();
  }, []);

  return {
    activeDocument: integration.activeDocument,
    activeWorkspace: integration.activeWorkspace,
    currentDocument: integration.currentDocument,
    sourcePage: integration.sourcePage,
    sourcePages: integration.sourcePages,
    bookmarks: integration.bookmarks,
    annotations: integration.annotations,
    railVisible,
    railTab,
    outline,
    query,
    activeQuery,
    searchWholeCollection,
    searchResults,
    searching,
    setRailTab,
    setQuery,
    setSearchWholeCollection,
    showRail: () => setRailVisible(true),
    hideRail: () => setRailVisible(false),
    openSearch,
    performSearch,
    goToPage,
    switchDocument: (documentId) => integrationRef.current.switchDocument(documentId),
    openSearchResult,
    removeBookmark,
    removeAnnotation: integration.removeAnnotation,
  };
}

const PdfNavigationControllerContext = createContext<PdfNavigationController | null>(null);

export function PdfNavigationControllerProvider({ controller, children }: PropsWithChildren<{ controller: PdfNavigationController }>) {
  return <PdfNavigationControllerContext.Provider value={controller}>{children}</PdfNavigationControllerContext.Provider>;
}

export function useActivePdfNavigationController() {
  const controller = useContext(PdfNavigationControllerContext);
  if (!controller) throw new Error("PdfNavigationControllerProvider is missing");
  return controller;
}
