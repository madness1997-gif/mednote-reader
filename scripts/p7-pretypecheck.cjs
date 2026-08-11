const fs = require('fs');
const path = 'app/pdf-reader-controller.ts';
if (!fs.existsSync(path)) process.exit(0);
let text = fs.readFileSync(path, 'utf8');
text = text.replace('return () => this.listeners.delete(listener);', 'return () => { this.listeners.delete(listener); };');
text = text.replace('            const occurrences = countOccurrences(text, trimmed);', '            if (text === undefined) continue;\n            const occurrences = countOccurrences(text, trimmed);');
fs.writeFileSync(path, text);
