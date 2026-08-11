const fs = require('node:fs');
const path = 'app/page.tsx';
let code = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const lines = code.split('\n');
let fixed = false;
for (let i = 0; i < lines.length; i += 1) {
  if (!lines[i].includes('<WorkspaceShell className=')) continue;
  const indent = lines[i].match(/^\s*/)?.[0] || '';
  lines[i] = `${indent}<WorkspaceShell className={\`workspace workspace-mode-\${workspaceMode} \${showPdfRail ? "" : "pdf-rail-collapsed"} \${showNoteSidebar ? "" : "note-sidebar-collapsed"} \${pdfRailTab === "pages" ? "" : "pdf-rail-wide"}\`} workspaceRef={workspaceRef} style={gridStyle} pdfRail={null} reader={null} divider={null} note={null} noteNavigation={null}>`;
  fixed = true;
}
if (!fixed) throw new Error('P9 workspace shell generated line not found');
fs.writeFileSync(path, lines.join('\n'));
console.log('P9 workspace syntax fixed');
