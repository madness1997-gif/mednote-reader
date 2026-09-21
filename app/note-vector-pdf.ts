import { createCaptureClone, paperNaturalSize, pdfPageSize, settleCaptureAssets } from "./pdf-export-core";

// Let Chromium shape text and paint SVG/CSS using the same layout as the editor.
// Only existing bitmap assets remain bitmaps; no page-sized screenshot is made.
export function createVectorExport() {
  const assets = new Map<string, Promise<string>>();
  const dataUrl = (url: string) => {
    if (url.startsWith("data:")) return Promise.resolve(url);
    if (!assets.has(url)) assets.set(url, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Không tải được hình hoặc font để xuất PDF");
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Không đọc được tài nguyên PDF"));
        reader.readAsDataURL(blob);
      });
    })());
    return assets.get(url)!;
  };
  const inlineUrls = async (css: string, base = document.baseURI) => {
    const matches = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    for (const match of matches) {
      if (match[1].startsWith("#")) continue;
      css = css.replace(match[0], `url("${await dataUrl(new URL(match[1], base).href)}")`);
    }
    return css;
  };
  let fonts: Promise<string> | undefined;
  const fontCss = () => fonts ??= (async () => {
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSFontFaceRule) rules.push(await inlineUrls(rule.cssText, sheet.href || document.baseURI));
      }
    }
    return rules.join("\n");
  })();
  return async (source: HTMLElement, index: number) => {
    const natural = paperNaturalSize(source);
    const size = pdfPageSize(natural.width, natural.height);
    const capture = createCaptureClone(source, natural.width, natural.height);
    try {
      await settleCaptureAssets(capture.clone);
      const originals = [capture.clone, ...capture.clone.querySelectorAll<HTMLElement>("*")];
      // Freeze computed geometry before changing any node's styles.
      const pseudoRules: string[] = [];
      const pseudoStyles = originals.flatMap((element, i) => ["::before", "::after"].flatMap(pseudo => {
        const computed = getComputedStyle(element, pseudo);
        if (computed.content === "none" || computed.content === "normal") return [];
        return [{ i, pseudo, css: Array.from(computed).map(key => `${key}:${computed.getPropertyValue(key)};`).join("") }];
      }));
      const styles = originals.map(element => {
        const computed = getComputedStyle(element);
        return Array.from(computed).map(key => `${key}:${computed.getPropertyValue(key)};`).join("");
      });
      for (let i = 0; i < originals.length; i++) {
        originals[i].setAttribute("style", await inlineUrls(styles[i]));
        for (const attr of Array.from(originals[i].attributes)) {
          if (/^on/i.test(attr.name)) originals[i].removeAttribute(attr.name);
        }
      }
      for (const item of pseudoStyles) {
        originals[item.i].setAttribute("data-print-node", `${index}-${item.i}`);
        pseudoRules.push(`[data-print-node="${index}-${item.i}"]${item.pseudo}{${await inlineUrls(item.css)}}`);
      }
      for (const img of capture.clone.querySelectorAll<HTMLImageElement>("img")) {
        if (!img.complete || !img.naturalWidth) throw new Error(`Hình ở Sheet ${index + 1} chưa tải được`);
        img.src = await dataUrl(img.currentSrc || img.src);
        img.removeAttribute("srcset");
        img.loading = "eager";
      }
      for (const canvas of capture.clone.querySelectorAll("canvas")) {
        const image = document.createElement("img");
        image.src = canvas.toDataURL("image/png");
        image.setAttribute("style", canvas.getAttribute("style") || "");
        canvas.replaceWith(image);
      }
      capture.clone.querySelectorAll("script,iframe,object,embed").forEach(node => node.remove());
      const scale = size.width / (natural.width * 0.75);
      capture.clone.style.transformOrigin = "top left";
      capture.clone.style.transform = `scale(${scale})`;
      return {
        css: `@page sheet${index} { size: ${size.width}pt ${size.height}pt; margin:0; }${pseudoRules.join("\n")}`,
        html: `<section style="page:sheet${index};width:${size.width}pt;height:${size.height}pt;overflow:hidden;position:relative;break-after:page">${capture.clone.outerHTML}</section>`,
        fonts: await fontCss(),
      };
    } finally { capture.remove(); }
  };
}

export function vectorPrintDocument(sheets: Array<{ css: string; html: string; fonts: string }>) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>${sheets[0]?.fonts || ""}
    html,body{margin:0;padding:0;background:white}*{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
    section:last-child{break-after:auto!important}${sheets.map(s => s.css).join("\n")}
    </style></head><body>${sheets.map(s => s.html).join("")}</body></html>`;
}

export async function openVectorPrint(html: string, fileName: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:1px;height:1px;bottom:0;left:0;border:0";
  frame.setAttribute("title", "In PDF");
  document.body.append(frame);
  try {
    await new Promise<void>(resolve => { frame.onload = () => resolve(); frame.srcdoc = html; });
    const win = frame.contentWindow!;
    win.document.title = fileName.replace(/\.pdf$/i, "");
    await win.document.fonts.ready;
    await Promise.all(Array.from(win.document.images).map(img => img.decode()));
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    win.focus();
    win.print();
    // Retain until afterprint: some browsers return before the dialog closes.
  } catch (error) { frame.remove(); throw error; }
}
