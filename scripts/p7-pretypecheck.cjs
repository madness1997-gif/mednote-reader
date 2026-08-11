const fs = require('fs');
const path = 'app/pdf-reader-controller.ts';
if (!fs.existsSync(path)) process.exit(0);
let text = fs.readFileSync(path, 'utf8');
text = text.replace('return () => this.listeners.delete(listener);', 'return () => { this.listeners.delete(listener); };');
text = text.replace(
  '            let text = cache.get(page);\n            if (text === undefined) {\n              text = textOf(await (await proxy.getPage(page)).getTextContent());\n              cache.set(page, text);\n            }',
  '            let text = cache.get(page);\n            if (text === undefined) {\n              const loadedText = textOf(await (await proxy.getPage(page)).getTextContent());\n              cache.set(page, loadedText);\n              text = loadedText;\n            }',
);
text = text.replace('            const occurrences = countOccurrences(text, trimmed);', '            if (text === undefined) continue;\n            const occurrences = countOccurrences(text, trimmed);');
fs.writeFileSync(path, text);
