import { useEffect, useMemo, useRef, useState } from "react";
import { noteRichTextController } from "./note-rich-text-controller";
import "./equation-composer.css";

type EquationDisplayMode = "inline" | "display";
type ParsedAtom = { html: string; next: number };
type EquationSnippet = { id: string; label: string; sample: string; source: string };
type EquationPreset = { label: string; source: string };

const MATH_STYLE = "font-family:Cambria Math,STIX Two Math,Times New Roman,serif;font-style:normal";

const EQUATION_SNIPPETS: EquationSnippet[] = [
  { id: "fraction", label: "Phân số", sample: "a⁄b", source: "\\frac{□}{□}" },
  { id: "root", label: "Căn", sample: "√x", source: "\\sqrt{□}" },
  { id: "power", label: "Số mũ", sample: "xⁿ", source: "□^{□}" },
  { id: "subscript", label: "Chỉ số", sample: "xᵢ", source: "□_{□}" },
  { id: "parentheses", label: "Ngoặc", sample: "( )", source: "\\left(□\\right)" },
  { id: "sum", label: "Tổng", sample: "∑", source: "\\sum_{i=1}^{n} □" },
  { id: "integral", label: "Tích phân", sample: "∫", source: "\\int_{a}^{b} □\\,dx" },
  { id: "matrix", label: "Ma trận", sample: "[ ]", source: "\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}" },
  { id: "cases", label: "Hệ / từng trường hợp", sample: "{", source: "\\begin{cases}□ & \\text{nếu } x\\ge0 \\\\ □ & \\text{nếu } x<0\\end{cases}" },
  { id: "plusminus", label: "Cộng trừ", sample: "±", source: "\\pm" },
  { id: "relation", label: "Quan hệ", sample: "≤ ≥ ≠", source: "\\le" },
  { id: "newline", label: "Dòng mới", sample: "↵", source: "\n" },
];

const EQUATION_PRESETS: EquationPreset[] = [
  { label: "Phương trình bậc hai", source: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" },
  { label: "CKD-EPI 2021", source: "eGFR=142\\cdot\\min\\left(\\frac{Scr}{\\kappa},1\\right)^\\alpha\\cdot\\max\\left(\\frac{Scr}{\\kappa},1\\right)^{-1.200}\\cdot0.9938^{Age}" },
  { label: "HOMA-IR", source: "HOMA\\text{-}IR=\\frac{Glucose\\cdot Insulin}{22.5}" },
  { label: "Khoảng tin cậy", source: "\\bar{x}\\pm1.96\\frac{s}{\\sqrt{n}}" },
  { label: "Phương trình nhiều dòng", source: "y=x^2+2x+1\ny=\\left(x+1\\right)^2" },
  { label: "Hệ phương trình", source: "\\begin{cases}2x+y=5 \\\\ x-y=1\\end{cases}" },
];

const COMMANDS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "·", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", infty: "∞", partial: "∂", nabla: "∇", degree: "°",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔",
  sum: "∑", prod: "∏", int: "∫", oint: "∮", lim: "lim", min: "min", max: "max", sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln", exp: "exp",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function readDelimited(source: string, start: number, open: string, close: string): { value: string; next: number } | null {
  if (source[start] !== open) return null;
  let depth = 1;
  let index = start + 1;
  const contentStart = index;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return { value: source.slice(contentStart, index), next: index + 1 };
    }
    index += 1;
  }
  return { value: source.slice(contentStart), next: source.length };
}

function readArgument(source: string, start: number): { value: string; next: number } {
  let index = start;
  while (source[index] === " ") index += 1;
  const group = readDelimited(source, index, "{", "}");
  if (group) return group;
  if (index >= source.length) return { value: "□", next: index };
  if (source[index] === "\\") {
    let end = index + 1;
    while (/[A-Za-z]/.test(source[end] ?? "")) end += 1;
    if (end === index + 1) end += 1;
    return { value: source.slice(index, end), next: end };
  }
  return { value: source[index], next: index + 1 };
}

function renderMatrix(body: string, environment: string) {
  const rows = body.split(/\\\\/).map((row) => row.trim()).filter(Boolean);
  const cells = rows.map((row) => row.split("&").map((cell) => parseMath(cell.trim())));
  const columnCount = Math.max(1, ...cells.map((row) => row.length));
  const delimiter = environment === "pmatrix" ? ["(", ")"] : environment === "vmatrix" ? ["|", "|"] : ["[", "]"];
  const grid = cells.flatMap((row) => [...row, ...Array.from({ length: Math.max(0, columnCount - row.length) }, () => "")])
    .map((cell) => `<span style="display:block;padding:1px 7px;text-align:center;white-space:nowrap">${cell || "&nbsp;"}</span>`).join("");
  return `<span style="${MATH_STYLE};display:inline-flex;align-items:center;vertical-align:middle;white-space:nowrap"><span style="font-size:1.65em;line-height:1">${delimiter[0]}</span><span style="display:inline-grid;grid-template-columns:repeat(${columnCount},auto);column-gap:2px;row-gap:1px;margin:0 3px;vertical-align:middle">${grid}</span><span style="font-size:1.65em;line-height:1">${delimiter[1]}</span></span>`;
}

function renderCases(body: string) {
  const rows = body.split(/\\\\/).map((row) => row.trim()).filter(Boolean);
  const grid = rows.map((row) => {
    const [expression, ...condition] = row.split("&");
    return `<span style="display:block;padding:1px 8px 1px 3px;white-space:nowrap">${parseMath(expression.trim())}</span><span style="display:block;padding:1px 3px;white-space:nowrap">${condition.length ? parseMath(condition.join("&").trim()) : "&nbsp;"}</span>`;
  }).join("");
  return `<span style="${MATH_STYLE};display:inline-flex;align-items:center;vertical-align:middle;white-space:nowrap"><span style="font-size:2em;line-height:1">{</span><span style="display:inline-grid;grid-template-columns:auto auto;column-gap:3px;row-gap:1px;margin-left:3px;vertical-align:middle">${grid}</span></span>`;
}

function renderFraction(numerator: string, denominator: string) {
  return `<span style="${MATH_STYLE};display:inline-block;vertical-align:middle;text-align:center;line-height:1.05;white-space:nowrap"><span style="display:block;padding:0 5px;border-bottom:1px solid currentColor">${parseMath(numerator)}</span><span style="display:block;padding:1px 5px 0">${parseMath(denominator)}</span></span>`;
}

function renderRoot(content: string, degree?: string) {
  return `<span style="${MATH_STYLE};display:inline-flex;align-items:flex-start;vertical-align:middle;white-space:nowrap">${degree ? `<sup>${parseMath(degree)}</sup>` : ""}<span style="font-size:1.12em">√</span><span style="border-top:1px solid currentColor;padding:1px 3px 0">${parseMath(content)}</span></span>`;
}

function applyScripts(base: string, subscript: string | null, superscript: string | null) {
  if (!subscript && !superscript) return base;
  if (subscript && superscript) {
    return `<span style="${MATH_STYLE};display:inline-flex;align-items:center;vertical-align:middle;white-space:nowrap">${base}<span style="display:inline-block;vertical-align:middle;line-height:1"><sup style="display:block">${parseMath(superscript)}</sup><sub style="display:block">${parseMath(subscript)}</sub></span></span>`;
  }
  return `<span style="${MATH_STYLE};white-space:nowrap">${base}${superscript ? `<sup>${parseMath(superscript)}</sup>` : ""}${subscript ? `<sub>${parseMath(subscript)}</sub>` : ""}</span>`;
}

function parseCommand(source: string, start: number): ParsedAtom {
  let index = start + 1;
  if (index >= source.length) return { html: "\\", next: index };
  if (!/[A-Za-z]/.test(source[index])) {
    const symbol = source[index];
    if (symbol === ",") return { html: "&thinsp;", next: index + 1 };
    if (symbol === ";") return { html: "&ensp;", next: index + 1 };
    if (symbol === "!") return { html: "", next: index + 1 };
    if (symbol === "\\") return { html: "<br>", next: index + 1 };
    return { html: escapeHtml(symbol), next: index + 1 };
  }
  const commandStart = index;
  while (/[A-Za-z]/.test(source[index] ?? "")) index += 1;
  const command = source.slice(commandStart, index);

  if (command === "frac" || command === "dfrac" || command === "tfrac") {
    const numerator = readArgument(source, index);
    const denominator = readArgument(source, numerator.next);
    return { html: renderFraction(numerator.value, denominator.value), next: denominator.next };
  }
  if (command === "sqrt") {
    let degree: string | undefined;
    const optionalDegree = readDelimited(source, index, "[", "]");
    if (optionalDegree) {
      degree = optionalDegree.value;
      index = optionalDegree.next;
    }
    const content = readArgument(source, index);
    return { html: renderRoot(content.value, degree), next: content.next };
  }
  if (command === "text" || command === "mathrm" || command === "operatorname") {
    const content = readArgument(source, index);
    const rendered = command === "text"
      ? escapeHtml(content.value).replace(/\s/g, "&nbsp;")
      : parseMath(content.value);
    return { html: `<span style="${MATH_STYLE};font-style:normal;white-space:nowrap">${rendered}</span>`, next: content.next };
  }
  if (command === "bar" || command === "overline") {
    const content = readArgument(source, index);
    return { html: `<span style="${MATH_STYLE};display:inline-block;border-top:1px solid currentColor;line-height:1;white-space:nowrap">${parseMath(content.value)}</span>`, next: content.next };
  }
  if (command === "left" || command === "right") return { html: "", next: index };
  if (command === "begin") {
    const environment = readArgument(source, index);
    const endToken = `\\end{${environment.value}}`;
    const end = source.indexOf(endToken, environment.next);
    const body = source.slice(environment.next, end >= 0 ? end : source.length);
    const next = end >= 0 ? end + endToken.length : source.length;
    if (["matrix", "bmatrix", "pmatrix", "vmatrix"].includes(environment.value)) return { html: renderMatrix(body, environment.value), next };
    if (environment.value === "cases" || environment.value === "aligned") return { html: environment.value === "cases" ? renderCases(body) : renderAligned(body), next };
    return { html: parseMath(body), next };
  }

  const symbol = COMMANDS[command];
  if (symbol) {
    const isLarge = ["sum", "prod", "int", "oint"].includes(command);
    const isOperator = ["lim", "min", "max", "sin", "cos", "tan", "log", "ln", "exp"].includes(command);
    return { html: `<span style="${MATH_STYLE};${isLarge ? "font-size:1.3em;" : ""}${isOperator ? "font-style:normal;" : ""}">${symbol}</span>`, next: index };
  }
  return { html: `<span style="${MATH_STYLE}">${escapeHtml(command)}</span>`, next: index };
}

function renderAligned(body: string) {
  const rows = body.split(/\\\\/).map((row) => row.replace(/&/g, "").trim()).filter(Boolean);
  return `<span style="${MATH_STYLE};display:inline-grid;grid-template-columns:1fr;row-gap:3px;vertical-align:middle">${rows.map((row) => `<span style="display:block;white-space:nowrap">${parseMath(row)}</span>`).join("")}</span>`;
}

function parseAtom(source: string, start: number): ParsedAtom {
  const character = source[start];
  if (character === "\\") return parseCommand(source, start);
  if (character === "{") {
    const group = readDelimited(source, start, "{", "}")!;
    return { html: parseMath(group.value), next: group.next };
  }
  if (character === " ") return { html: "&nbsp;", next: start + 1 };
  return { html: escapeHtml(character), next: start + 1 };
}

function parseMath(source: string) {
  const normalized = source
    .replace(/<=/g, "\\le ")
    .replace(/>=/g, "\\ge ")
    .replace(/!=/g, "\\ne ")
    .replace(/->/g, "\\to ");
  const output: string[] = [];
  let index = 0;
  while (index < normalized.length) {
    if (normalized[index] === "}") {
      index += 1;
      continue;
    }
    const atom = parseAtom(normalized, index);
    index = atom.next;
    let subscript: string | null = null;
    let superscript: string | null = null;
    while (index < normalized.length && (normalized[index] === "_" || normalized[index] === "^")) {
      const marker = normalized[index];
      const argument = readArgument(normalized, index + 1);
      if (marker === "_") subscript = argument.value;
      else superscript = argument.value;
      index = argument.next;
    }
    output.push(applyScripts(atom.html, subscript, superscript));
  }
  return output.join("");
}

function equationMarkup(source: string, mode: EquationDisplayMode) {
  const lines = source.split(/\r?\n/);
  const content = lines.length > 1
    ? `<span style="${MATH_STYLE};display:inline-grid;grid-template-columns:1fr;row-gap:5px;text-align:left;vertical-align:middle">${lines.map((line) => `<span style="display:block;white-space:nowrap">${parseMath(line || "□")}</span>`).join("")}</span>`
    : parseMath(lines[0] || "□");
  return mode === "display"
    ? `<div style="${MATH_STYLE};display:block;margin:8px 0;text-align:center;line-height:1.35">${content}</div>`
    : `<span style="${MATH_STYLE};display:inline-block;vertical-align:middle;line-height:1.25;white-space:nowrap">${content}</span>`;
}

export default function EquationComposer() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}");
  const [mode, setMode] = useState<EquationDisplayMode>("display");
  const [message, setMessage] = useState("Dùng các khối bên dưới để ghép nhiều thành phần trong cùng một công thức.");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const interceptFormulaButton = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.word-command-button[title="Chèn công thức"]') : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setMessage(noteRichTextController.activeEditorRef.current ? "Có thể nhập trực tiếp hoặc bấm các khối để ghép biểu thức." : "Hãy bấm vào vị trí cần chèn trong note trước khi xác nhận.");
      setOpen(true);
    };
    document.addEventListener("click", interceptFormulaButton, true);
    return () => document.removeEventListener("click", interceptFormulaButton, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const marker = source.indexOf("□");
      if (marker >= 0) textareaRef.current?.setSelectionRange(marker, marker + 1);
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  const preview = useMemo(() => equationMarkup(source, mode), [mode, source]);

  const insertSnippet = (snippet: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? source.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${source.slice(0, start)}${snippet}${source.slice(end)}`;
    setSource(next);
    window.requestAnimationFrame(() => {
      const marker = snippet.indexOf("□");
      const cursorStart = marker >= 0 ? start + marker : start + snippet.length;
      const cursorEnd = marker >= 0 ? cursorStart + 1 : cursorStart;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const insertEquation = () => {
    if (!noteRichTextController.activeEditorRef.current?.editor.isConnected) {
      setMessage("Chưa có vị trí chèn. Đóng cửa sổ, bấm vào nội dung hoặc textbox rồi mở Công thức lại.");
      return;
    }
    const markup = equationMarkup(source.trim() || "□", mode);
    noteRichTextController.insertHtml(mode === "display" ? `${markup}<div><br></div>` : `${markup}&nbsp;`);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="advanced-equation-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="advanced-equation-dialog" role="dialog" aria-modal="true" aria-label="Trình soạn công thức nhiều thành phần">
        <header>
          <div><strong><span aria-hidden="true">∑</span> Trình soạn công thức</strong><small>Ghép phân số, căn, chỉ số, tổng, tích phân, ma trận và nhiều dòng</small></div>
          <button onClick={() => setOpen(false)} aria-label="Đóng">×</button>
        </header>

        <div className="advanced-equation-mode" aria-label="Kiểu hiển thị công thức">
          <button className={mode === "inline" ? "selected" : ""} onClick={() => setMode("inline")}>Trong dòng</button>
          <button className={mode === "display" ? "selected" : ""} onClick={() => setMode("display")}>Phương trình riêng</button>
        </div>

        <label className="advanced-equation-source">
          <span>Nội dung công thức</span>
          <textarea
            ref={textareaRef}
            rows={4}
            value={source}
            spellCheck={false}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                insertEquation();
              }
            }}
            placeholder="Ví dụ: x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}"
          />
        </label>

        <div className="advanced-equation-snippets" aria-label="Khối công thức">
          {EQUATION_SNIPPETS.map((snippet) => <button key={snippet.id} onClick={() => insertSnippet(snippet.source)} title={snippet.label}><b>{snippet.sample}</b><span>{snippet.label}</span></button>)}
        </div>

        <div className="advanced-equation-preview" aria-label="Xem trước công thức" dangerouslySetInnerHTML={{ __html: preview }} />
        <p className="advanced-equation-message">{message}</p>

        <div className="advanced-equation-presets">
          <span>Mẫu hoàn chỉnh</span>
          <div>{EQUATION_PRESETS.map((preset) => <button key={preset.label} onClick={() => { setSource(preset.source); window.requestAnimationFrame(() => textareaRef.current?.focus()); }}>{preset.label}</button>)}</div>
        </div>

        <details className="advanced-equation-help">
          <summary>Cú pháp được hỗ trợ</summary>
          <p><code>{"\\frac{a}{b}"}</code> · <code>{"\\sqrt{x}"}</code> · <code>{"x^{2}"}</code> · <code>{"x_{i}"}</code> · <code>{"\\sum_{i=1}^{n}"}</code> · <code>{"\\int_{a}^{b}"}</code></p>
          <p>Nhấn Enter để tạo phương trình nhiều dòng. Ma trận và hệ phương trình có thể tạo bằng nút khối, không cần nhớ cú pháp.</p>
        </details>

        <footer>
          <button className="advanced-equation-cancel" onClick={() => setOpen(false)}>Hủy</button>
          <button className="advanced-equation-insert" onClick={insertEquation}><span aria-hidden="true">∑</span> Chèn công thức <kbd>Ctrl+Enter</kbd></button>
        </footer>
      </section>
    </div>
  );
}
