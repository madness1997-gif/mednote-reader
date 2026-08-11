const fs = require('node:fs');
const ts = require('typescript');
const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const removeNames = new Set(['PdfThumbnail', 'NoteSheetPreview']);
const edits = [];
for (const stmt of sf.statements) {
  if (ts.isFunctionDeclaration(stmt) && stmt.name && removeNames.has(stmt.name.text)) {
    edits.push({ start: stmt.getFullStart(), end: stmt.getEnd() });
  }
}
if (edits.length !== removeNames.size) throw new Error(`Expected to remove ${removeNames.size} local UI functions, got ${edits.length}`);
edits.sort((a,b) => b.start - a.start);
for (const edit of edits) source = source.slice(0, edit.start) + source.slice(edit.end);
const anchor = 'import { WorkspaceShell } from "./ui/workspace-shell";';
const line = 'import { NoteSheetPreview } from "./ui/note-sheet-preview";';
if (!source.includes(line)) {
  if (!source.includes(anchor)) throw new Error('WorkspaceShell import anchor missing');
  source = source.replace(anchor, `${anchor}\n${line}`);
}
fs.writeFileSync(path, source);
console.log('P9 local thumbnail and sheet preview removed');
