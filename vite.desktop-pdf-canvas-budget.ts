import type { Plugin } from "vite";

const managerImportNeedle = 'import type { PDFiumDocument } from "./pdfium-renderer";';

const oldLazyPageView = `type LazyPdfPageViewProps = PdfPageViewProps & { estimatedHeight?: number };

export function LazyPdfPageView(props: LazyPdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(props.estimatedHeight ?? 780);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.closest(".document-stage");
    // About one neighbouring page is pre-rendered in either direction. Pages
    // farther away unmount their canvases, allowing Chromium to release bitmap
    // memory instead of caching an entire book at HiDPI.
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), { root, rootMargin: "700px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const pageElement = host?.querySelector(".pdf-page-host");
    if (!visible || !pageElement) return;
    const update = () => setMeasuredHeight(Math.max(260, pageElement.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={hostRef} className="lazy-pdf-page" data-pdf-page={props.page} style={{ minHeight: visible ? undefined : measuredHeight }}>
      {visible ? <PdfPageView {...props} continuous /> : <div className="pdf-page-placeholder"><span>Trang {props.page}</span></div>}
    </div>
  );
}`;

const newLazyPageView = `type LazyPdfPageViewProps = PdfPageViewProps & { estimatedHeight?: number };

function desktopPdfCanvasBytes(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLCanvasElement>("canvas"))
    .reduce((total, canvas) => total + Math.max(0, canvas.width) * Math.max(0, canvas.height) * 4, 0);
}

function releaseDesktopPdfCanvases(host: HTMLElement) {
  host.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
    // Shrinking the backing store releases the large GPU/Skia bitmap before
    // React removes the page node. CSS size is also collapsed so Chromium does
    // not keep a stale surface around while the placeholder is committed.
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = "1px";
    canvas.style.height = "1px";
  });
}

export function LazyPdfPageView(props: LazyPdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [cacheAllowed, setCacheAllowed] = useState(true);
  const [measuredHeight, setMeasuredHeight] = useState(props.estimatedHeight ?? 780);
  const cacheKey = useMemo(
    () => "desktop-pdf-" + props.page + "-" + Math.random().toString(16).slice(2),
    [props.document, props.page],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.closest(".document-stage");
    // Keep the existing one-page warm window for smooth scrolling. The desktop
    // memory budget below may evict a warm page, but never a page near the real
    // viewport.
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), { root, rootMargin: "700px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.closest(".document-stage");
    const observer = new IntersectionObserver((entries) => {
      const hot = entries[0].isIntersecting;
      hotRef.current = hot;
      if (hot) {
        setCacheAllowed(true);
        desktopPdfCanvasBudget.touch(cacheKey);
      }
    }, { root, rootMargin: "120px 0px" });
    observer.observe(host);
    return () => {
      hotRef.current = false;
      observer.disconnect();
    };
  }, [cacheKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visible || !cacheAllowed) {
      desktopPdfCanvasBudget.remove(cacheKey);
      return;
    }

    let disposed = false;
    let evicting = false;
    const observedCanvases = new Set<HTMLCanvasElement>();
    const resizeObserver = new ResizeObserver(() => report());

    const observeCanvases = () => {
      host.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
        if (observedCanvases.has(canvas)) return;
        observedCanvases.add(canvas);
        resizeObserver.observe(canvas);
      });
    };

    const evict = () => {
      if (disposed || evicting || hotRef.current) return;
      evicting = true;
      releaseDesktopPdfCanvases(host);
      setCacheAllowed(false);
    };

    function report() {
      if (disposed || evicting) return;
      observeCanvases();
      const bytes = desktopPdfCanvasBytes(host);
      if (!bytes) return;
      desktopPdfCanvasBudget.report(cacheKey, bytes, evict, () => hotRef.current);
    }

    const mutationObserver = new MutationObserver(() => report());
    mutationObserver.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["width", "height", "style"],
    });
    window.requestAnimationFrame(report);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      desktopPdfCanvasBudget.remove(cacheKey);
    };
  }, [cacheAllowed, cacheKey, visible]);

  useEffect(() => {
    const host = hostRef.current;
    const pageElement = host?.querySelector(".pdf-page-host");
    if (!visible || !cacheAllowed || !pageElement) return;
    const update = () => setMeasuredHeight(Math.max(260, pageElement.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    return () => observer.disconnect();
  }, [cacheAllowed, visible]);

  return (
    <div ref={hostRef} className="lazy-pdf-page" data-pdf-page={props.page} style={{ minHeight: visible && cacheAllowed ? undefined : measuredHeight }}>
      {visible && cacheAllowed ? <PdfPageView {...props} continuous /> : <div className="pdf-page-placeholder"><span>Trang {props.page}</span></div>}
    </div>
  );
}`;

export function desktopPdfCanvasBudgetPlugin(): Plugin {
  return {
    name: "mednote-desktop-pdf-canvas-budget",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/pdf-reader.tsx")) return null;
      const normalizedCode = code.replace(/\r\n/g, "\n");
      if (!normalizedCode.includes(managerImportNeedle)) {
        throw new Error("Desktop PDF canvas budget: PDFium import anchor not found");
      }
      if (!normalizedCode.includes(oldLazyPageView)) {
        throw new Error("Desktop PDF canvas budget: LazyPdfPageView anchor not found");
      }
      const next = normalizedCode
        .replace(
          managerImportNeedle,
          managerImportNeedle + '\nimport { desktopPdfCanvasBudget } from "./desktop-pdf-canvas-budget";',
        )
        .replace(oldLazyPageView, newLazyPageView);
      return { code: next, map: null };
    },
  };
}
