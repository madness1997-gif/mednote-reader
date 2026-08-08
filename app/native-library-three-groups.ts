const STYLE_ID = "mednote-native-library-three-groups-style";
const HEADER_CLASS = "native-library-group-header";
const MORE_CLASS = "native-library-more";

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
  display:flex!important;
  flex-direction:column!important;
  min-width:0!important;
  gap:0!important;
  margin-top:14px!important;
  overflow:visible!important;
}
.library-list.native-three-groups > .library-row{
  position:relative!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 34px!important;
  align-items:stretch!important;
  width:100%!important;
  min-width:0!important;
  gap:6px!important;
  margin:0 0 4px!important;
}
.library-list.native-three-groups .library-item{
  grid-column:1!important;
  width:100%!important;
  min-width:0!important;
  display:grid!important;
  grid-template-columns:30px minmax(0,1fr)!important;
  align-items:center!important;
  gap:8px!important;
  padding:7px 8px!important;
  border-radius:9px!important;
}
.library-list.native-three-groups .library-icon{
  width:30px!important;
  height:30px!important;
  min-width:30px!important;
  border-radius:7px!important;
}
.library-list.native-three-groups .library-item > span:last-child{
  min-width:0!important;
}
.library-list.native-three-groups .library-item strong{
  display:block!important;
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
  font-size:13px!important;
  line-height:1.25!important;
}
.library-list.native-three-groups .library-item small{
  display:none!important;
}
.library-list.native-three-groups .library-action{
  display:none!important;
}
.${MORE_CLASS}{
  grid-column:2!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:34px!important;
  min-width:34px!important;
  height:100%!important;
  min-height:40px!important;
  padding:0!important;
  border:1px solid #dbe5e7!important;
  border-radius:9px!important;
  background:#fff!important;
  color:#58717a!important;
  font:700 20px/1 system-ui,sans-serif!important;
  cursor:pointer!important;
  touch-action:manipulation!important;
}
.${MORE_CLASS}:hover,
.${MORE_CLASS}:focus-visible,
.library-row-menu-open > .${MORE_CLASS}{
  background:#eef6f7!important;
  border-color:#aac9cf!important;
  color:#155f6b!important;
  outline:none!important;
}
.library-list.native-three-groups .library-row-menu-open .library-action.library-rename,
.library-list.native-three-groups .library-row-menu-open .library-action.library-delete{
  position:absolute!important;
  right:0!important;
  z-index:20!important;
  display:flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  width:148px!important;
  min-width:148px!important;
  height:36px!important;
  padding:0 12px!important;
  gap:8px!important;
  border:1px solid #dbe5e7!important;
  background:#fff!important;
  box-shadow:0 8px 22px rgba(28,49,58,.14)!important;
}
.library-list.native-three-groups .library-row-menu-open .library-action.library-rename{
  top:39px!important;
  border-radius:9px 9px 0 0!important;
}
.library-list.native-three-groups .library-row-menu-open .library-action.library-delete{
  top:74px!important;
  border-radius:0 0 9px 9px!important;
  color:#a13e3e!important;
}
.library-list.native-three-groups .library-row-menu-open .library-action.library-rename::after{
  content:"Đổi tên";
  font-size:12px;
  font-weight:700;
}
.library-list.native-three-groups .library-row-menu-open .library-action.library-delete::after{
  content:"Xóa";
  font-size:12px;
  font-weight:700;
}
.library-list.native-three-groups > .library-row.library-row-renaming{
  grid-template-columns:minmax(0,1fr) 34px 34px!important;
}
.library-list.native-three-groups .library-row-renaming > .${MORE_CLASS}{
  display:none!important;
}
.library-list.native-three-groups .library-row-renaming .library-action.library-save,
.library-list.native-three-groups .library-row-renaming .library-action.library-cancel{
  position:static!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:34px!important;
  min-width:34px!important;
  height:auto!important;
  min-height:40px!important;
  padding:0!important;
  border-radius:9px!important;
}
.library-list.native-three-groups .library-row-renaming .library-action.library-save{grid-column:2!important}
.library-list.native-three-groups .library-row-renaming .library-action.library-cancel{grid-column:3!important}
.${HEADER_CLASS}{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:10px!important;
  width:100%!important;
  min-width:0!important;
  margin:10px 0 6px!important;
  padding:7px 2px 6px!important;
  border-bottom:1px solid #dce5e7!important;
  color:#304a53!important;
}
.${HEADER_CLASS}:first-of-type{margin-top:0!important}
.${HEADER_CLASS} strong{
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
  font-size:12px!important;
  font-weight:800!important;
  letter-spacing:.01em!important;
}
.${HEADER_CLASS} span{
  flex:0 0 auto!important;
  font-size:10px!important;
  color:#87969b!important;
  font-weight:700!important;
}
@media(max-width:640px){
  .library-list.native-three-groups .library-item strong{font-size:12px!important}
  .${HEADER_CLASS} strong{font-size:11px!important}
}
`;
  document.head.append(style);
}

const orderBase: Record<GroupKind, number> = { pdf: 1000, linked: 2000, standalone: 3000 };

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
  header.style.order = String(orderBase[kind]);
  return header;
}

function closeMenus(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>(".library-row-menu-open").forEach((row) => {
    if (row !== except) row.classList.remove("library-row-menu-open");
  });
}

function enhanceRow(row: HTMLElement) {
  const renaming = Boolean(row.querySelector(".library-save, .library-cancel"));
  row.classList.toggle("library-row-renaming", renaming);

  const hasMenuActions = Boolean(row.querySelector(".library-rename, .library-delete"));
  let more = row.querySelector<HTMLButtonElement>(`:scope > .${MORE_CLASS}`);

  if (!hasMenuActions || renaming) {
    more?.remove();
    row.classList.remove("library-row-menu-open");
    return;
  }

  if (!more) {
    more = document.createElement("button");
    more.type = "button";
    more.className = MORE_CLASS;
    more.textContent = "⋮";
    more.setAttribute("aria-label", "Tùy chọn");
    more.setAttribute("title", "Tùy chọn");
    more.addEventListener("pointerdown", (event) => event.stopPropagation());
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !row.classList.contains("library-row-menu-open");
      closeMenus(row);
      row.classList.toggle("library-row-menu-open", willOpen);
      more?.setAttribute("aria-expanded", String(willOpen));
    });
    row.append(more);
  }
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
    counts[kind] += 1;
    row.style.order = String(orderBase[kind] + counts[kind]);
    enhanceRow(row);
  });

  const pdfHeader = ensureHeader(list, "pdf", "Tài liệu PDF / cụm tài liệu");
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
document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(`.${MORE_CLASS}, .library-action`)) closeMenus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenus();
});
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", schedule, { once: true })
  : schedule();
window.setInterval(schedule, 1000);

export {};
