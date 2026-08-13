import assert from "node:assert/strict";
import test from "node:test";
import { createBlock } from "../app/first-aid-block-domain";
import { renderFirstAidBlocksHtml } from "../app/first-aid-block-renderer";
import {
  appendEmptyTableColumn,
  appendEmptyTableRow,
  firstAidTableLayout,
  resizeTableColumn,
  resizeTableRow,
} from "../app/first-aid-table-layout";

test("First Aid tables add genuinely empty cells", () => {
  const rows = [["", ""], ["", ""]];
  assert.deepEqual(appendEmptyTableRow(rows, 2, () => ""), [["", ""], ["", ""], ["", ""]]);
  assert.deepEqual(appendEmptyTableColumn(rows, () => ""), [["", "", ""], ["", "", ""]]);
  assert.equal(JSON.stringify(createBlock("table")).includes("Nội dung"), false);
});

test("First Aid table dimensions resize within readable bounds and survive rendering", () => {
  const block = {
    ...createBlock("table"),
    rows: [["Thuốc", "Vai trò"], ["PTU", "Ức chế tổng hợp"]],
    columnWidths: [.35, .65],
    rowHeights: [30, 44],
  };
  const layout = firstAidTableLayout(block, 2, 2);
  const widerFirstColumn = resizeTableColumn(layout.columnWidths, 0, 60, 600);
  const tallerSecondRow = resizeTableRow(layout.rowHeights, 1, 24);

  assert.ok(widerFirstColumn[0] > layout.columnWidths[0]);
  assert.ok(Math.abs(widerFirstColumn.reduce((sum, value) => sum + value, 0) - 1) < .001);
  assert.equal(tallerSecondRow[1], 68);
  const html = renderFirstAidBlocksHtml([{ ...block, columnWidths: widerFirstColumn, rowHeights: tallerSecondRow }]);
  assert.match(html, /<colgroup>/);
  assert.match(html, /height:68px/);
});
