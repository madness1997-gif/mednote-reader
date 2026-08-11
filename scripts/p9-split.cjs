const fs = require('node:fs');
const ts = require('typescript');

const PAGE = 'app/page.tsx';
let source = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
const sf = ts.createSourceFile(PAGE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function classText(node) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return '';
  const attrs = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr) || attr.name.text !== 'className' || !attr.initializer) continue;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
    return attr.initializer.getText(sf);
  }
  return '';
}
function findElement(match) {
  let found = null;
  function visit(node) {
    if (found) return;
    if (ts.isJsxElement(node) && classText(node).includes(match)) { found = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!found) throw new Error(`P9: missing JSX element ${match}`);
  return found;
}
function text(node) { return source.slice(node.getStart(sf), node.getEnd()); }

const globals = new Set(['undefined','NaN','Infinity','Math','Number','String','Boolean','Object','Array','Date','Set','Map','WeakMap','WeakSet','Promise','JSON','Intl','RegExp','Error','TypeError','URL','Blob','File','FileList','Event','InputEvent','CustomEvent','HTMLElement','Element','Node','Range','window','document','navigator','crypto','structuredClone','parseInt','parseFloat','isNaN','console','React']);
const keywords = new Set(['true','false','null','this','new','return','const','let','var','if','else','for','while','switch','case','break','continue','function','class','typeof','instanceof','in','of','as','await','async','void','delete','export','default','import','from','extends','implements','interface','type','keyof','readonly','public','private','protected','static','get','set','yield']);

function collectNames(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) name.elements.forEach((e) => { if (ts.isBindingElement(e)) collectNames(e.name, out); });
}
function scopeFor(fragment, extras = []) {
  const wrap = `const __p9 = () => (<>${fragment}</>);`;
  const f = ts.createSourceFile('fragment.tsx', wrap, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declared = new Set();
  const refs = new Set(extras);
  function declareVisit(node) {
    if (ts.isVariableDeclaration(node)) collectNames(node.name, declared);
    if (ts.isParameter(node)) collectNames(node.name, declared);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)) && node.name) declared.add(node.name.text);
    ts.forEachChild(node, declareVisit);
  }
  declareVisit(f);
  function isTypePosition(node) {
    let p = node.parent;
    while (p) {
      if (ts.isTypeNode(p)) return true;
      if (ts.isExpression(p) || ts.isStatement(p) || ts.isJsxChild(p) || ts.isSourceFile(p)) return false;
      p = p.parent;
    }
    return false;
  }
  function refVisit(node) {
    if (ts.isIdentifier(node)) {
      const n = node.text;
      const p = node.parent;
      let skip = false;
      if (declared.has(n) || globals.has(n) || keywords.has(n)) skip = true;
      if (ts.isPropertyAccessExpression(p) && p.name === node) skip = true;
      if (ts.isPropertyAssignment(p) && p.name === node && !ts.isShorthandPropertyAssignment(p)) skip = true;
      if (ts.isMethodDeclaration(p) && p.name === node) skip = true;
      if (ts.isJsxAttribute(p) && p.name === node) skip = true;
      if ((ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === node && /^[a-z]/.test(n)) skip = true;
      if (isTypePosition(node)) skip = true;
      if (!skip) refs.add(n);
    }
    ts.forEachChild(node, refVisit);
  }
  refVisit(f);
  return [...refs].sort();
}
function scopeExpr(refs) { return `{ ${refs.join(', ')} }`; }
function componentFile(name, fragment, opts = {}) {
  const refs = scopeFor(fragment, opts.extraRefs || []).filter((x) => !(opts.excludeRefs || []).includes(x));
  const imports = opts.imports ? `${opts.imports}\n` : '';
  const aliases = 'type TextLineHeight = any; type PaperTemplate = any; type PdfFitMode = any; type PdfViewMode = any; type PdfTool = any;';
  const body = opts.body || `return (<>${fragment}</>);`;
  const code = `import type React from "react";\n${imports}${aliases}\n\nexport type P9UiScope = Record<string, any>;\n\nexport function ${name}({ scope }: { scope: P9UiScope }) {\n  const { ${refs.join(', ')} } = scope;\n  ${body}\n}\n`;
  return { code, refs };
}
function write(path, content) { fs.mkdirSync(require('node:path').dirname(path), { recursive: true }); fs.writeFileSync(path, content); }

const topbar = findElement('topbar');
const drive = findElement('drive-panel');
const library = findElement('library-backdrop');
const workspace = findElement('workspace workspace-mode-');
const rail = findElement('pdf-thumbnails');
const reader = findElement('reader-pane');
const notes = findElement('notes-pane');
const noteNav = findElement('note-navigation-host');

// Build direct-source PDF rail with virtualization.
let railFragment = text(rail);
const pageStart = railFragment.indexOf('{pdfRailTab === "pages" && (');
const pageEnd = railFragment.indexOf('{pdfRailTab === "outline" && (', pageStart);
if (pageStart < 0 || pageEnd < 0) throw new Error('P9: thumbnail branch anchors missing');
railFragment = railFragment.slice(0, pageStart) + `{pdfRailTab === "pages" && (\n            <VirtualPdfThumbnailList pages={sourcePages} document={currentPdfDocument} activeDocumentId={activeDocument?.id ?? null} activePage={sourcePage} onPageClick={goToPageFromRail} />\n          )}\n\n          ` + railFragment.slice(pageEnd);
const railOut = componentFile('PdfNavigationRail', railFragment, { imports: 'import { VirtualPdfThumbnailList } from "../virtualized-thumbnails";', excludeRefs: ['VirtualPdfThumbnailList'] });
write('app/ui/pdf-navigation-rail.tsx', railOut.code);

const topOut = componentFile('AppTopBar', text(topbar));
write('app/ui/app-top-bar.tsx', topOut.code);
const driveOut = componentFile('DrivePanel', text(drive));
write('app/ui/drive-panel.tsx', driveOut.code);
const libraryOut = componentFile('LibraryPanel', text(library));
write('app/ui/library-panel.tsx', libraryOut.code);

// Reader: split toolbar from stage while keeping all runtime state in Home scope.
const readerToolbarNode = reader.children.find((child) => ts.isJsxElement(child) && classText(child).includes('pane-toolbar pdf-toolbar'));
if (!readerToolbarNode) throw new Error('P9: reader toolbar missing');
const readerToolbarFragment = text(readerToolbarNode);
const readerStageFragment = reader.children.filter((child) => child !== readerToolbarNode).map((child) => text(child)).join('');
const toolbarOut = componentFile('PdfToolbar', readerToolbarFragment);
write('app/ui/pdf-toolbar.tsx', toolbarOut.code);
const readerStageOut = componentFile('PdfReaderStage', readerStageFragment);
write('app/ui/pdf-reader-stage.tsx', readerStageOut.code);
const readerRefs = [...new Set([...toolbarOut.refs, ...readerStageOut.refs])].sort();
write('app/ui/pdf-reader-pane.tsx', `import { PdfToolbar } from "./pdf-toolbar";\nimport { PdfReaderStage } from "./pdf-reader-stage";\nexport function ReaderPane({ scope }: { scope: Record<string, any> }) { return <section className="reader-pane"><PdfToolbar scope={scope} /><PdfReaderStage scope={scope} /></section>; }\n`);

// Note: split toolbar from stage. P8 engines remain external and are only assembled by NoteStage.
const noteToolbarNode = notes.children.find((child) => ts.isJsxElement(child) && classText(child).includes('note-toolbar'));
if (!noteToolbarNode) throw new Error('P9: note toolbar missing');
const noteToolbarFragment = text(noteToolbarNode);
const noteStageFragment = notes.children.filter((child) => child !== noteToolbarNode).map((child) => text(child)).join('');
const noteToolbarOut = componentFile('NoteToolbar', noteToolbarFragment);
write('app/ui/note-toolbar.tsx', noteToolbarOut.code);
const noteStageOut = componentFile('NoteStage', noteStageFragment);
write('app/ui/note-stage.tsx', noteStageOut.code);
write('app/ui/note-pane.tsx', `import { NoteToolbar } from "./note-toolbar";\nimport { NoteStage } from "./note-stage";\nexport function NotePane({ scope }: { scope: Record<string, any> }) { return <section className="notes-pane"><NoteToolbar scope={scope} /><NoteStage scope={scope} /></section>; }\n`);

const navOut = componentFile('NoteNavigationHost', text(noteNav));
write('app/ui/note-navigation-host.tsx', navOut.code);
write('app/ui/split-divider.tsx', `import type React from "react";\nexport function SplitDivider({ onPointerDown }: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void }) { return <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={onPointerDown}><span>•••</span></div>; }\n`);
write('app/ui/workspace-shell.tsx', `import type { CSSProperties, ReactNode, RefObject } from "react";\nexport function WorkspaceShell({ className, workspaceRef, style, pdfRail, reader, divider, note, noteNavigation }: { className: string; workspaceRef: RefObject<HTMLElement | null>; style: CSSProperties; pdfRail: ReactNode; reader: ReactNode; divider: ReactNode; note: ReactNode; noteNavigation: ReactNode }) { return <section className={className} ref={workspaceRef} style={style}>{pdfRail}{reader}{divider}{note}{noteNavigation}</section>; }\n`);

// Apply replacements from right to left using original AST positions.
const edits = [];
function replaceNode(node, replacement) { edits.push({ start: node.getStart(sf), end: node.getEnd(), replacement }); }
replaceNode(topbar, `<AppTopBar scope=${scopeExpr(topOut.refs)} />`);
replaceNode(drive, `<DrivePanel scope=${scopeExpr(driveOut.refs)} />`);
replaceNode(library, `<LibraryPanel scope=${scopeExpr(libraryOut.refs)} />`);
replaceNode(rail, `{showReader && <PdfNavigationRail scope=${scopeExpr(railOut.refs)} />}`);
replaceNode(reader, `{showReader && <ReaderPane scope=${scopeExpr(readerRefs)} />}`);
replaceNode(notes, `{showNote && <NotePane scope=${scopeExpr([...new Set([...noteToolbarOut.refs, ...noteStageOut.refs])].sort())} />}`);
replaceNode(noteNav, `{showNote && showNoteSidebar && <NoteNavigationHost scope=${scopeExpr(navOut.refs)} />}`);
// Replace legacy divider node between Reader and Note with source component.
const dividerStart = source.indexOf('<div className="split-divider"', reader.getEnd());
if (dividerStart < 0) throw new Error('P9: split divider missing');
const dividerEnd = source.indexOf('</div>', dividerStart) + '</div>'.length;
edits.push({ start: dividerStart, end: dividerEnd, replacement: `{workspaceMode === "split" && <SplitDivider onPointerDown={startResize} />}` });
// Workspace outer tag becomes WorkspaceShell while children remain slot-composed source.
edits.push({ start: workspace.openingElement.getStart(sf), end: workspace.openingElement.getEnd(), replacement: `<WorkspaceShell className={\`workspace workspace-mode-${'${workspaceMode}'} ${'${showPdfRail ? "" : "pdf-rail-collapsed"}'} ${'${showNoteSidebar ? "" : "note-sidebar-collapsed"}'} ${'${pdfRailTab === "pages" ? "" : "pdf-rail-wide"}'}\`} workspaceRef={workspaceRef} style={gridStyle} pdfRail={null} reader={null} divider={null} note={null} noteNavigation={null}>` });
edits.push({ start: workspace.closingElement.getStart(sf), end: workspace.closingElement.getEnd(), replacement: `</WorkspaceShell>` });

edits.sort((a,b) => b.start - a.start);
for (const e of edits) source = source.slice(0,e.start) + e.replacement + source.slice(e.end);

// The WorkspaceShell slots are expressed as children during migration; component accepts children too.
let ws = fs.readFileSync('app/ui/workspace-shell.tsx','utf8');
ws = ws.replace('noteNavigation: ReactNode }) { return <section className={className} ref={workspaceRef} style={style}>{pdfRail}{reader}{divider}{note}{noteNavigation}</section>; }', 'noteNavigation: ReactNode; children?: ReactNode }) { return <section className={className} ref={workspaceRef} style={style}>{pdfRail}{reader}{divider}{note}{noteNavigation}{children}</section>; }');
fs.writeFileSync('app/ui/workspace-shell.tsx', ws);

const imports = `import { AppTopBar } from "./ui/app-top-bar";\nimport { DrivePanel } from "./ui/drive-panel";\nimport { LibraryPanel } from "./ui/library-panel";\nimport { PdfNavigationRail } from "./ui/pdf-navigation-rail";\nimport { ReaderPane } from "./ui/pdf-reader-pane";\nimport { NotePane } from "./ui/note-pane";\nimport { NoteNavigationHost } from "./ui/note-navigation-host";\nimport { SplitDivider } from "./ui/split-divider";\nimport { WorkspaceShell } from "./ui/workspace-shell";`;
const importAnchor = 'import PageTitleEditor from "./page-title-editor";';
if (!source.includes(importAnchor)) throw new Error('P9: import anchor missing');
source = source.replace(importAnchor, `${importAnchor}\n${imports}`);
const returnAnchor = '  return (\n    <main className="app-shell">';
if (!source.includes(returnAnchor)) throw new Error('P9: Home return anchor missing');
source = source.replace(returnAnchor, `  const showReader = workspaceMode !== "note";\n  const showNote = workspaceMode !== "reader";\n\n${returnAnchor}`);
fs.writeFileSync(PAGE, source);

// Remove page.tsx source-transform plugins from both Vite configs.
for (const configPath of ['vite.github.config.ts','vite.desktop.config.ts']) {
  let c = fs.readFileSync(configPath,'utf8');
  c = c.replace(/import \{ thumbnailVirtualizationPlugin \} from "\.\/vite\.thumbnail-virtualization";\n/g,'');
  c = c.replace(/import \{ workspaceSuspensionPlugin \} from "\.\/vite\.workspace-suspension";\n/g,'');
  c = c.replace(/thumbnailVirtualizationPlugin\(\),\s*/g,'');
  c = c.replace(/workspaceSuspensionPlugin\(\),\s*/g,'');
  fs.writeFileSync(configPath,c);
}
for (const old of ['vite.workspace-suspension.ts','vite.thumbnail-virtualization.ts']) if (fs.existsSync(old)) fs.unlinkSync(old);

console.log('P9 UI split migration applied');
