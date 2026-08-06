const NOTE_ZOOM_PRESETS = [50, 60, 70, 75, 80, 85, 90, 100, 110, 120, 125, 130, 140, 150, 175, 200];

function clampZoom(value: number) {
  return Math.max(0.5, Math.min(2, Number.isFinite(value) ? value : 1));
}

function parsePaperRatio(value: string) {
  const match = value.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  return width > 0 && height > 0 ? width / height : 210 / 297;
}

function setPropertyIfChanged(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

function syncPaperZoom(paper: HTMLElement) {
  const style = window.getComputedStyle(paper);
  const zoom = clampZoom(Number.parseFloat(style.getPropertyValue("--note-view-zoom")) || 1);
  const naturalWidth = Math.max(240, Number.parseFloat(style.getPropertyValue("--paper-max-width")) || 720);
  const ratio = parsePaperRatio(style.getPropertyValue("--paper-ratio"));
  const naturalHeight = naturalWidth / ratio;
  const scaledWidth = naturalWidth * zoom;
  const scaledHeight = naturalHeight * zoom;

  if (!paper.classList.contains("note-zoom-runtime")) paper.classList.add("note-zoom-runtime");
  setPropertyIfChanged(paper, "--note-natural-width", `${naturalWidth}px`);
  setPropertyIfChanged(paper, "--note-natural-height", `${naturalHeight}px`);
  setPropertyIfChanged(paper, "--note-zoom-width", `${scaledWidth}px`);
  setPropertyIfChanged(paper, "--note-zoom-height", `${scaledHeight}px`);
}

let syncFrame: number | null = null;
function scheduleZoomSync() {
  if (syncFrame !== null) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = null;
    document.querySelectorAll<HTMLElement>(".note-paper").forEach(syncPaperZoom);
  });
}

function noteZoomSelect(stage: Element) {
  return stage.closest(".notes-pane")?.querySelector<HTMLSelectElement>(".note-view-control select") ?? null;
}

function currentZoomPercent(stage: Element) {
  const paper = stage.querySelector<HTMLElement>(".note-paper");
  if (!paper) return 100;
  const value = Number.parseFloat(window.getComputedStyle(paper).getPropertyValue("--note-view-zoom"));
  return Math.round(clampZoom(value || 1) * 100);
}

function nearestPresetIndex(percent: number) {
  return NOTE_ZOOM_PRESETS.reduce((best, option, index) =>
    Math.abs(option - percent) < Math.abs(NOTE_ZOOM_PRESETS[best] - percent) ? index : best, 0);
}

function changeNoteZoom(stage: HTMLElement, direction: -1 | 1) {
  const select = noteZoomSelect(stage);
  if (!select) return;
  const current = currentZoomPercent(stage);
  const index = nearestPresetIndex(current);
  const nextIndex = Math.max(0, Math.min(NOTE_ZOOM_PRESETS.length - 1, index + direction));
  const next = NOTE_ZOOM_PRESETS[nextIndex];
  if (next === current) return;

  const paper = stage.querySelector<HTMLElement>(".note-paper");
  const oldWidth = paper?.offsetWidth || 1;
  const oldHeight = paper?.offsetHeight || 1;
  const oldLeft = paper?.offsetLeft || 0;
  const oldTop = paper?.offsetTop || 0;
  const focusX = (stage.scrollLeft + stage.clientWidth / 2 - oldLeft) / oldWidth;
  const focusY = (stage.scrollTop + stage.clientHeight / 2 - oldTop) / oldHeight;

  select.value = String(next);
  select.dispatchEvent(new Event("change", { bubbles: true }));

  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    scheduleZoomSync();
    const nextPaper = stage.querySelector<HTMLElement>(".note-paper");
    if (!nextPaper) return;
    stage.scrollLeft = Math.max(0, nextPaper.offsetLeft + focusX * nextPaper.offsetWidth - stage.clientWidth / 2);
    stage.scrollTop = Math.max(0, nextPaper.offsetTop + focusY * nextPaper.offsetHeight - stage.clientHeight / 2);
  }));
}

function noteStageFromEventTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".note-stage") : null;
}

const observer = new MutationObserver(scheduleZoomSync);
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["style", "class"],
});

window.addEventListener("resize", scheduleZoomSync);

document.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const stage = noteStageFromEventTarget(event.target);
  if (!stage) return;
  event.preventDefault();
  event.stopPropagation();
  changeNoteZoom(stage, event.deltaY < 0 ? 1 : -1);
}, { capture: true, passive: false });

document.addEventListener("keydown", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const stage = noteStageFromEventTarget(event.target) ?? document.querySelector<HTMLElement>(".note-stage:hover");
  if (!stage) return;
  const key = event.key;
  if (key !== "+" && key !== "=" && key !== "-" && key !== "0") return;
  event.preventDefault();
  event.stopPropagation();
  if (key === "0") {
    const fitButton = stage.closest(".notes-pane")?.querySelector<HTMLButtonElement>(".note-view-control button:last-child");
    fitButton?.click();
    return;
  }
  changeNoteZoom(stage, key === "-" ? -1 : 1);
}, { capture: true });

scheduleZoomSync();

export {};
