import type { PdfAnnotation } from "./pdf-domain";

export type PdfDocumentExportInput = {
  blob: Blob;
  annotations: PdfAnnotation[];
};

function cssColorToHex(color: string) {
  if (color.startsWith("#")) return color;
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return "#111111";
  return `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb01(color: string) {
  const hex = cssColorToHex(color).replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((character) => character + character).join("") : hex.padEnd(6, "0").slice(0, 6);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    green: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    blue: Number.parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

function standardPdfText(value: string) {
  return value
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

export async function exportAnnotatedPdf({ blob, annotations }: PdfDocumentExportInput): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const originalBytes = new Uint8Array(await blob.arrayBuffer());
  const output = await PDFDocument.load(originalBytes.slice(), { ignoreEncryption: true });
  const pages = output.getPages();
  const regularFont = await output.embedFont(StandardFonts.Helvetica);
  const boldFont = await output.embedFont(StandardFonts.HelveticaBold);
  const signatureFont = await output.embedFont(StandardFonts.HelveticaOblique);
  const colorOf = (value: string) => {
    const color = hexToRgb01(value);
    return rgb(color.red, color.green, color.blue);
  };
  const drawText = (page: (typeof pages)[number], value: string, options: Parameters<(typeof page)["drawText"]>[1]) => {
    try {
      page.drawText(value, options);
    } catch {
      page.drawText(standardPdfText(value), options);
    }
  };

  annotations.forEach((annotation) => {
    const target = pages[annotation.page - 1];
    if (!target) return;
    const color = colorOf(annotation.color);
    if (annotation.kind === "ink") {
      annotation.points.slice(1).forEach((point, index) => {
        const previous = annotation.points[index];
        target.drawLine({
          start: { x: previous.x, y: previous.y },
          end: { x: point.x, y: point.y },
          color,
          thickness: Math.max(.7, annotation.width),
          opacity: .96,
        });
      });
      return;
    }
    if ("rects" in annotation) {
      annotation.rects.forEach((rect) => {
        const x = Math.min(rect.x1, rect.x2);
        const y = Math.min(rect.y1, rect.y2);
        const width = Math.abs(rect.x2 - rect.x1);
        const height = Math.abs(rect.y2 - rect.y1);
        if (annotation.kind === "highlight" || annotation.kind === "area-highlight") {
          target.drawRectangle({ x, y, width, height, color, opacity: .34 });
        } else if (annotation.kind === "underline") {
          target.drawLine({ start: { x, y: y + .6 }, end: { x: x + width, y: y + .6 }, color, thickness: 1.2 });
        } else if (annotation.kind === "strikeout") {
          target.drawLine({ start: { x, y: y + height * .52 }, end: { x: x + width, y: y + height * .52 }, color, thickness: 1.2 });
        } else {
          const step = Math.max(2.4, Math.min(4, height * .24));
          for (let cursor = x; cursor < x + width; cursor += step) {
            target.drawLine({
              start: { x: cursor, y: y + 1.2 },
              end: { x: Math.min(x + width, cursor + step / 2), y: y + 2.8 },
              color,
              thickness: 1,
            });
            target.drawLine({
              start: { x: Math.min(x + width, cursor + step / 2), y: y + 2.8 },
              end: { x: Math.min(x + width, cursor + step), y: y + 1.2 },
              color,
              thickness: 1,
            });
          }
        }
      });
      return;
    }

    const rect = annotation.rect;
    const x = Math.min(rect.x1, rect.x2);
    const y = Math.min(rect.y1, rect.y2);
    const width = Math.abs(rect.x2 - rect.x1);
    const height = Math.abs(rect.y2 - rect.y1);
    const thickness = Math.max(.8, annotation.width);
    if (annotation.kind === "rectangle") {
      target.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: thickness });
    } else if (annotation.kind === "ellipse") {
      target.drawEllipse({ x: x + width / 2, y: y + height / 2, xScale: width / 2, yScale: height / 2, borderColor: color, borderWidth: thickness });
    } else if (annotation.kind === "arrow") {
      target.drawLine({ start: { x, y: y + height }, end: { x: x + width, y }, color, thickness });
      const angle = Math.atan2(-height, width);
      const head = Math.min(16, Math.max(7, Math.min(width, height) * .28));
      [angle + Math.PI * .78, angle - Math.PI * .78].forEach((branch) => {
        target.drawLine({
          start: { x: x + width, y },
          end: { x: x + width + Math.cos(branch) * head, y: y + Math.sin(branch) * head },
          color,
          thickness,
        });
      });
    } else if (annotation.kind === "note") {
      target.drawRectangle({ x, y, width, height, color, opacity: .84, borderColor: color, borderWidth: .8 });
      drawText(target, "!", { x: x + width * .38, y: y + height * .24, size: Math.max(8, height * .48), font: boldFont, color: rgb(1, 1, 1) });
    } else if (annotation.kind === "stamp") {
      target.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: Math.max(1.4, thickness) });
      const value = annotation.text || "DA XEM";
      drawText(target, value, { x: x + 6, y: y + Math.max(4, height * .32), size: Math.max(8, Math.min(18, height * .38)), font: boldFont, color });
    } else {
      const font = annotation.kind === "signature" ? signatureFont : regularFont;
      const size = annotation.kind === "signature" ? Math.max(10, Math.min(24, height * .45)) : Math.max(8, Math.min(16, height * .28));
      drawText(target, annotation.text || (annotation.kind === "signature" ? "Ky ten" : "Ghi chu"), {
        x: x + 3,
        y: y + Math.max(3, height - size - 4),
        size,
        font,
        color,
        maxWidth: Math.max(20, width - 6),
        lineHeight: size * 1.2,
      });
    }
  });

  const bytes = await output.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}
