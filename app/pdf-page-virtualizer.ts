export const PDF_CONTINUOUS_PAGE_GAP = 22;
export const PDF_CONTINUOUS_ESTIMATED_HEIGHT = 780;
export const PDF_CONTINUOUS_OVERSCAN = 1_400;

export type PdfPageVirtualMetrics = {
  heights: number[];
  offsets: number[];
  totalHeight: number;
};

export type PdfPageVirtualRange = { start: number; end: number };

export function pdfPageVirtualMetrics(
  pages: number[],
  measuredHeights: ReadonlyMap<number, number>,
  estimatedHeight = PDF_CONTINUOUS_ESTIMATED_HEIGHT,
  gap = PDF_CONTINUOUS_PAGE_GAP,
): PdfPageVirtualMetrics {
  const fallback = Math.max(260, estimatedHeight);
  const heights = pages.map((page) => Math.max(260, measuredHeights.get(page) ?? fallback));
  const offsets = new Array<number>(pages.length);
  let cursor = 0;
  for (let index = 0; index < pages.length; index += 1) {
    offsets[index] = cursor;
    cursor += heights[index] + (index + 1 < pages.length ? gap : 0);
  }
  return { heights, offsets, totalHeight: cursor };
}

function firstIndex(count: number, predicate: (index: number) => boolean) {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (predicate(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function pdfPageVirtualRange(
  metrics: PdfPageVirtualMetrics,
  viewportTop: number,
  viewportHeight: number,
  overscan = PDF_CONTINUOUS_OVERSCAN,
): PdfPageVirtualRange {
  const count = metrics.offsets.length;
  if (!count) return { start: 0, end: 0 };
  const minimum = Math.max(0, viewportTop - overscan);
  const maximum = Math.max(minimum, viewportTop + Math.max(1, viewportHeight) + overscan);
  const start = Math.min(count - 1, firstIndex(count, (index) => metrics.offsets[index] + metrics.heights[index] >= minimum));
  const end = Math.max(start + 1, firstIndex(count, (index) => metrics.offsets[index] > maximum));
  return { start, end: Math.min(count, end) };
}

export function nearestPdfVirtualPageIndex(metrics: PdfPageVirtualMetrics, offset: number) {
  const count = metrics.offsets.length;
  if (!count) return -1;
  const next = firstIndex(count, (index) => metrics.offsets[index] >= offset);
  if (next <= 0) return 0;
  if (next >= count) return count - 1;
  return Math.abs(metrics.offsets[next] - offset) < Math.abs(metrics.offsets[next - 1] - offset)
    ? next
    : next - 1;
}
