const STYLE_ID = "mednote-native-library-three-groups-style";
const HEADER_CLASS = "native-library-group-header";

type GroupKind = "pdf" | "linked" | "standalone";

const normalize = (value: string) => value.trim().toLocaleLowerCase("vi");

function classifyRow(row: HTMLElement): GroupKind | "hidden" {
  const title = normalize(row.querySelector<HTMLElement>(".library-item strong")?.textContent || "");
  const meta = normalize(row.querySelector<HTMLElement>(".library-item small")?.textContent || "");

  // Internal metadata workspace must never be exposed in the user library.
  if (title === "mednote relations" || title.startsWith("mednote relations")) return "hidden";

  const hasNoPdf = meta.includes("chưa có pdf");
  const noteLike =
    title.startsWith("ghi chú") ||
    title.startsWith("sổ ghi chú") ||
    title.startsWith("notebook") ||
    /(^|—|-)\s*ghi chú\b/.test(title);

  if (hasNoPdf) return "standalone";
  if (noteLike) return "linked";
  return "pdf";
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.library-list.native-three-groups{display:flex!important;flex-direction:column!important;gap:6px!important;margin-top:14px!important}
.library-list.native-three-groups > .library-row{flex:0 0 auto}
.${HEADER_CLASS}{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;padding:7px 3px 3px;border-bottom:1px solid #dce5e7;color:#304a53}
.${HEADER_CLASS}:first-of-type{margin-top:0}
.${HEADER_CLASS} strong{font-size:11px;font-weight:800;letter-spacing:.01em}
.${HEADER_CLASS} span{font-size:9px;color:#87969b;font-weight:650}
@media(max-width:520px){
  .${HEADER_CLASS}{padding-top:6px}
  .${HEADER_CLASS} strong{font-size:10px}
  .${HEADER_CLASS} span{font-size:8px}
}
`;
  document.head.append(style);
}

function ensureHeader(list: HTMLElement, kind: GroupKind, label: string, order: number) {
  let header = list.querySelector<HTMLElement>(`:scope > .${HEADER_CLASS}[data-group="${kind}"]`);
  if (!header) {
    header = document.createElement("div");
    header.className = HEADER_CLASS;
    header.dataset.group = kind;
    const strong = document.createElement("strong");
    strong.textContent = label;
    const count = document.createElement("span");
    header.append(strong, count);
    list.append(header);
  }
  header.style.order = String(order);
  return header;
}

function organizeList(list: HTMLElement) {
  const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > .library-row"));
  if (!rows.length) return;

  list.classList.add("native-three-groups");
  const counts: Record<GroupKind, number> = { pdf: 0, linked: 0, standalone: 0 };
  const offsets: Record<GroupKind, number> = { pdf: 10, linked: 110, standalone: 210 };

  rows.forEach((row) => {
    const kind = classifyRow(row);
    if (kind === "hidden") {
      row.style.display = "none";
      return;
    }
    row.style.display = "";
    row.dataset.libraryGroup = kind;
    row.style.order = String(offsets[kind] + counts[kind]);
    counts[kind] += 1;
  });

  const pdfHeader = ensureHeader(list, "pdf", "Tài liệu PDF / cụm PDF", 0);
  const linkedHeader = ensureHeader(list, "linked", "Note gắn tài liệu", 100);
  const standaloneHeader = ensureHeader(list, "standalone", "Note độc lập", 200);

  const setCount = (header: HTMLElement, count: number) => {
    const node = header.querySelector<HTMLElement>("span");
    if (node) node.textContent = String(count);
  };
  setCount(pdfHeader, counts.pdf);
  setCount(linkedHeader, counts.linked);
  setCount(standaloneHeader, counts.standalone);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(".library-list").forEach(organizeList);
  });
}

injectStyle();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", schedule, { once: true })
  : schedule();
window.setInterval(schedule, 1000);

export {};
