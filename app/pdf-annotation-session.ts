import type { PdfAnnotation, PdfMarkupAnnotation } from "./pdf-domain";

export type PdfAnnotationHistory = {
  undo: PdfAnnotation[][];
  redo: PdfAnnotation[][];
};

export const PDF_ANNOTATION_HISTORY_LIMIT = 60;

const unchanged = (left: PdfAnnotation[], right: PdfAnnotation[]) =>
  left.length === right.length && left.every((annotation, index) => annotation === right[index]);

export function emptyPdfAnnotationHistory(): PdfAnnotationHistory {
  return { undo: [], redo: [] };
}

export function commitPdfAnnotations(
  current: PdfAnnotation[],
  next: PdfAnnotation[],
  history: PdfAnnotationHistory,
  limit = PDF_ANNOTATION_HISTORY_LIMIT,
) {
  if (unchanged(current, next)) return { annotations: current, history };
  return {
    annotations: next,
    history: {
      undo: [...history.undo, current].slice(-limit),
      redo: [],
    },
  };
}

export function undoPdfAnnotations(current: PdfAnnotation[], history: PdfAnnotationHistory) {
  const previous = history.undo.at(-1);
  if (!previous) return { annotations: current, history };
  return {
    annotations: previous,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [current, ...history.redo].slice(0, PDF_ANNOTATION_HISTORY_LIMIT),
    },
  };
}

export function redoPdfAnnotations(current: PdfAnnotation[], history: PdfAnnotationHistory) {
  const next = history.redo[0];
  if (!next) return { annotations: current, history };
  return {
    annotations: next,
    history: {
      undo: [...history.undo, current].slice(-PDF_ANNOTATION_HISTORY_LIMIT),
      redo: history.redo.slice(1),
    },
  };
}

export function deletePdfAnnotation(current: PdfAnnotation[], annotationId: string, history: PdfAnnotationHistory) {
  return commitPdfAnnotations(current, current.filter((annotation) => annotation.id !== annotationId), history);
}

export function addPdfMarkup(current: PdfAnnotation[], annotation: PdfMarkupAnnotation, history: PdfAnnotationHistory) {
  return commitPdfAnnotations(current, [...current, annotation], history);
}

export function replacePdfPageAnnotations(
  current: PdfAnnotation[],
  page: number,
  nextPage: PdfAnnotation[],
  previousPage: PdfAnnotation[],
  history: PdfAnnotationHistory,
) {
  const other = current.filter((annotation) => annotation.page !== page);
  const previous = [...other, ...previousPage];
  const next = [...other, ...nextPage.map((annotation) => ({ ...annotation, page }))];
  return commitPdfAnnotations(previous, next, history);
}
