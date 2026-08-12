const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const library = fs.readFileSync(path.join(root, 'app/ui/library-panel.tsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'app/note-sidebar.tsx'), 'utf8');
const colorModule = fs.readFileSync(path.join(root, 'app/notebook-color.ts'), 'utf8');

assert.match(library, /import \{ notebookIconStyle \} from "\.\.\/notebook-color";/);
assert.match(sidebar, /import \{ notebookIconStyle \} from "\.\/notebook-color";/);
assert.equal((library.match(/function notebookIconStyle\s*\(/g) || []).length, 0, 'Library must not own a duplicate Notebook color generator');
assert.equal((sidebar.match(/function notebookIconStyle\s*\(/g) || []).length, 0, 'Sidebar must not own a duplicate Notebook color generator');
assert.equal((colorModule.match(/export function notebookIconStyle\s*\(/g) || []).length, 1, 'Notebook color generator must have one canonical implementation');

console.log('Notebook color single-source regression passed');
