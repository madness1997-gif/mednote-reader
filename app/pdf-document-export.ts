import type { PdfAnnotation, PdfRect } from "./pdf-domain";

export type PdfDocumentExportInput = {
  blob: Blob;
  annotations: PdfAnnotation[];
};

function normalizeRect(rect: PdfRect) {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

function colorOf(value: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!hex) return [0.1, .25, .35] as const;
  const raw = Number.parseInt(hex[1], 16);
  return [((raw >> 16) & 255) / 255, ((raw >> 8) & 255) / 255, (raw & 255) / 255] as const;
}

export async function exportAnnotatedPdf({ blob, annotations }: PdfDocumentExportInput): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const original = new Uint8Array(await blob.arrayBuffer());
  const output = await PDFDocument.load(original.slice(), { ignoreEncryption: true });
  const pages = output.getPages();
  const regularFont = await output.embedFont(StandardFonts.Helvetica);
  const boldFont = await output.embedFont(StandardFonts.HelveticaBold);
  const signatureFont = await output.embedFont(StandardFonts.HelveticaOblique);

  for (const annotation of annotations) {
    const page = pages[annotation.page - 1];
    if (!page) continue;
    const [red, green, blue] = colorOf(annotation.color);
    const color = rgb(red, green, blue);

    if (annotation.kind === "highlight" || annotation.kind === "area-highlight") {
      for (const raw of annotation.rects) {
        const rect = normalizeRect(raw);
        page.drawRectangle({
          x: rect.x1,
          y: rect.y1,
          width: rect.x2 - rect.x1,
          height: rect.y2 - rect.y1,
          color,
          opacity: .28,
          borderOpacity: 0,
        });
      }
      continue;
    }

    if (annotation.kind === "underline" || annotation.kind === "strikeout" || annotation.kind === "squiggly") {
      for (const raw of annotation.rects) {
        const rect = normalizeRect(raw);
        const y = annotation.kind === "strikeout" ? (rect.y1 + rect.y2) / 2 : rect.y1;
        page.drawLine({
          start: { x: rect.x1, y },
          end: { x: rect.x2, y },
          thickness: annotation.kind === "squiggly" ? 1.5 : 1,
          color,
          opacity: .95,
        });
      }
      continue;
    }

    if (annotation.kind === "ink") {
      for (let index = 1; index < annotation.points.length; index += 1) {
        page.drawLine({
          start: { x: annotation.points[index - 1].x, y: annotation.points[index - 1].y },
          end: { x: annotation.points[index].x, y: annotation.points[index].y },
          thickness: annotation.width,
          color,
          opacity: .95,
        });
      }
      continue;
    }

    const rect = normalizeRect(annotation.rect);
    if (annotation.kind === "rectangle") {
      page.drawRectangle({
        x: rect.x1,
        y: rect.y1,
        width: rect.x2 - rect.x1,
        height: rect.y2 - rect.y1,
        borderColor: color,
        borderWidth: annotation.width,
      });
    } else if (annotation.kind === "ellipse") {
      page.drawEllipse({
        x: (rect.x1 + rect.x2) / 2,
        y: (rect.y1 + rect.y2) / 2,
        xScale: (rect.x2 - rect.x1) / 2,
        yScale: (rect.y2 - rect.y1) / 2,
        borderColor: color,
        borderWidth: annotation.width,
      });
    } else if (annotation.kind === "arrow") {
      page.drawLine({
        start: { x: rect.x1, y: rect.y1 },
        end: { x: rect.x2, y: rect.y2 },
        thickness: annotation.width,
        color,
      });
    } else {
      const text = annotation.text || (annotation.kind === "stamp" ? "STAMP" : annotation.kind === "signature" ? "Signature" : "Note");
      page.drawText(text.slice(0, 500), {
        x: rect.x1,
        y: rect.y1,
        size: Math.max(8, Math.min(18, rect.y2 - rect.y1 || 12)),
        font: annotation.kind === "signature" ? signatureFont : annotation.kind === "stamp" ? boldFont : regularFont,
        color,
        maxWidth: Math.max(20, rect.x2 - rect.x1),
        lineHeight: 12,
      });
    }
  }

  return new Blob([await output.save()], { type: "application/pdf" });
}
