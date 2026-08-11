import assert from "node:assert/strict";
import test from "node:test";
import { commitPdfAnnotations, deletePdfAnnotation, emptyPdfAnnotationHistory, redoPdfAnnotations, replacePdfPageAnnotations, undoPdfAnnotations } from "../app/pdf-annotation-session";

const annotation = (id: string, page = 1): any => ({ id, kind: "highlight", page, color: "#ffff00", rects: [], text: "", createdAt: 1 });

test("annotation history is capped at 60 and undo redo are stable", () => {
  let annotations: any[] = [];
  let history = emptyPdfAnnotationHistory();
  for (let index = 0; index < 70; index += 1) {
    const result = commitPdfAnnotations(annotations, [...annotations, annotation(String(index))], history);
    annotations = result.annotations;
    history = result.history;
  }
  assert.equal(history.undo.length, 60);
  const undone = undoPdfAnnotations(annotations, history);
  assert.equal(undone.annotations.length, 69);
  const redone = redoPdfAnnotations(undone.annotations, undone.history);
  assert.equal(redone.annotations.length, 70);
});

test("delete and page replacement do not leak annotations between pages/documents", () => {
  const current = [annotation("a", 1), annotation("b", 2)];
  const removed = deletePdfAnnotation(current, "a", emptyPdfAnnotationHistory());
  assert.deepEqual(removed.annotations.map((item) => item.id), ["b"]);
  const replaced = replacePdfPageAnnotations(current, 1, [annotation("c", 1)], [annotation("a", 1)], emptyPdfAnnotationHistory());
  assert.deepEqual(replaced.annotations.map((item) => item.id).sort(), ["b", "c"]);
  assert.equal(current.length, 2);
});
