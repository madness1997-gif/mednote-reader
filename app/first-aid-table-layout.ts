import type { FirstAidBlock } from "./first-aid-block-domain";

export const DEFAULT_FIRST_AID_ROW_HEIGHT = 26;
const MIN_COLUMN_WIDTH = .06;

const round = (value: number) => Number(value.toFixed(4));

export function normalizeTableColumnWidths(widths: readonly number[] | undefined, columns: number) {
  const count = Math.max(1, columns);
  const values = Array.from({ length: count }, (_, index) => {
    const value = Number(widths?.[index]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => round(value / total));
}

export function normalizeTableRowHeights(heights: readonly number[] | undefined, rows: number) {
  return Array.from({ length: Math.max(1, rows) }, (_, index) => {
    const value = Number(heights?.[index]);
    return Number.isFinite(value) ? Math.min(600, Math.max(DEFAULT_FIRST_AID_ROW_HEIGHT, Math.round(value))) : DEFAULT_FIRST_AID_ROW_HEIGHT;
  });
}

export function firstAidTableLayout(block: FirstAidBlock, rows: number, columns: number) {
  return {
    columnWidths: normalizeTableColumnWidths(block.columnWidths, columns),
    rowHeights: normalizeTableRowHeights(block.rowHeights, rows),
  };
}

export function resizeTableColumn(widths: readonly number[], index: number, deltaPx: number, gridWidth: number) {
  const normalized = normalizeTableColumnWidths(widths, widths.length);
  if (index < 0 || index >= normalized.length - 1) return normalized;
  const pairWidth = normalized[index] + normalized[index + 1];
  const minWidth = Math.min(pairWidth / 2, Math.max(MIN_COLUMN_WIDTH, 36 / Math.max(1, gridWidth)));
  const nextLeft = Math.min(pairWidth - minWidth, Math.max(minWidth, normalized[index] + deltaPx / Math.max(1, gridWidth)));
  const next = [...normalized];
  next[index] = round(nextLeft);
  next[index + 1] = round(pairWidth - nextLeft);
  return next;
}

export function resizeTableRow(heights: readonly number[], index: number, deltaPx: number) {
  const normalized = normalizeTableRowHeights(heights, heights.length);
  if (index < 0 || index >= normalized.length) return normalized;
  normalized[index] = Math.min(600, Math.max(DEFAULT_FIRST_AID_ROW_HEIGHT, Math.round(normalized[index] + deltaPx)));
  return normalized;
}

export function appendEmptyTableRow<T>(rows: readonly (readonly T[])[], columns: number, empty: () => T) {
  return [...rows.map((row) => [...row]), Array.from({ length: Math.max(1, columns) }, empty)];
}

export function appendEmptyTableColumn<T>(rows: readonly (readonly T[])[], empty: () => T) {
  return rows.map((row) => [...row, empty()]);
}
