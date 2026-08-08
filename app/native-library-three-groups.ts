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
    title.includes("ghi chú —") ||
    title.includes("ghi chú -");

  if (hasNoPdf) return "standalone";
  if (noteLike) return "linked";
  return "pdf";
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.library-list.native-three-groups{
  display:grid!important;
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  grid-auto-rows:auto!important;
  align-items:start!important;
  gap:7px 10px!important;
  margin-top:14px!important;
}
.library-list.native-three-groups > .library-row{min-width:0!important;align-self:start!important}
.library-list.native-three-groups .library-row{grid-template-columns:minmax(0,1fr) 30px 30px!important;gap:4px!important}
.library-list.native-three-groups .library-item{grid-template-columns:28px minmax(0,1fr)!important;gap:7px!important;padding:8px!important}
.library-list.native-three-groups .library-icon{width:28px!important;height:28px!important;border-radius:7px!important}
.library-list.native-three-groups .library-item strong{font-size:11px!important}
.library-list.native-three-groups .library-item small{display:none!important}
.library-list.native-three-groups .library-action{width:30px!important;min-width:30px!important;border-radius:8px!important}
.${HEADER_CLASS}{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-width:0;
  padding:7px 4px 5px;
  border-bottom:1px solid #dce5e7;
  color:#304a53;
}
.${HEADER_CLASS} strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:800;letter-spacing:.01em}
.${HEADER_CLASS} span{flex:0 0 auto;font-size:9px;color:#87969b;font-weight:650}
@media(max-width:640px){
  .library-list.native-three-groups{min-width:620px!important;grid-template-columns:repeat(3,minmax(190px,1fr))!important}
  .${HEADER_CLASS} strong{font-size:10px}
  .${HEADER_CLASS} span{font-size:8px}
}
`;
  document.head.append(style);
}

const columnOf: Record<GroupKind, number> = { pdf: 1, linked: 2, standalone: 3 };

function ensureHeader(list: HTMLElement, kind: GroupKind, label: string) {
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
  header.style.gridColumn = String(columnOf[kind]);
  header.style.gridRow = "1";
  return header;
}

function organizeList(list: HTMLElement) {
  const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > .library-row"));
  if (!rows.length) return;

  list.classList.add("native-three-groups");
  const counts: Record<GroupKind, number> = { pdf: 0, linked: 0, standalone: 0 };

  rows.forEach((row) => {
    const kind = classifyRow(row);
    row.style.order = "";
    if (kind === "hidden") {
      row.style.display = "none";
      return;
    }
    row.style.display = "";
    row.dataset.libraryGroup = kind;
    row.style.gridColumn = String(columnOf[kind]);
    row.style.gridRow = String(counts[kind] + 2);
    counts[kind] += 1;
  });

  const pdfHeader = ensureHeader(list, "pdf", "Tài liệu PDF / cụm PDF");
  const linkedHeader = ensureHeader(list, "linked", "Note gắn tài liệu");
  const standaloneHeader = ensureHeader(list, "standalone", "Note độc lập");

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
