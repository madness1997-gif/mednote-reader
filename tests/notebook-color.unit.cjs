const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const library = fs.readFileSync(path.join(root, 'app/ui/library-panel.tsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'app/note-sidebar.tsx'), 'utf8');
const colorModule = fs.readFileSync(path.join(root, 'app/notebook-color.ts'), 'utf8');
const uiAdapter = fs.readFileSync(path.join(root, 'app/ui/notebook-color-style.ts'), 'utf8');

assert.match(library, /import \{ notebookIconStyle \} from "\.\/notebook-color-style";/);
assert.match(sidebar, /import \{ notebookIconStyle \} from "\.\/ui\/notebook-color-style";/);
assert.equal((library.match(/function notebookIconStyle\s*\(/g) || []).length, 0, 'Library must not own a duplicate Notebook color generator');
assert.equal((sidebar.match(/function notebookIconStyle\s*\(/g) || []).length, 0, 'Sidebar must not own a duplicate Notebook color generator');
assert.equal((colorModule.match(/export function notebookColorTokens\s*\(/g) || []).length, 1, 'Notebook color identity must have one canonical generator');
assert.equal((uiAdapter.match(/export function notebookIconStyle\s*\(/g) || []).length, 1, 'Notebook icon styling must have one UI adapter');
assert.match(uiAdapter, /notebookColorTokens\(notebookId\)/);
assert.doesNotMatch(colorModule, /from ["']react["']|CSSProperties/, 'Core Notebook color generator must remain framework-agnostic');

console.log('Notebook color architecture regression passed');
