import { useEffect, type RefObject } from "react";

export const NOTE_ZOOM_PRESETS = [50, 60, 70, 75, 80, 85, 90, 100, 110, 120, 125, 130, 140, 150, 175, 200] as const;

function nearestPresetIndex(percent: number) {
  return NOTE_ZOOM_PRESETS.reduce((best, option, index) =>
    Math.abs(option - percent) < Math.abs(NOTE_ZOOM_PRESETS[best] - percent) ? index : best, 0);
}

export function nextNoteZoom(current: number, direction: -1 | 1) {
  const percent = Math.round(Math.max(.5, Math.min(2, current)) * 100);
  const index = nearestPresetIndex(percent);
  const nextIndex = Math.max(0, Math.min(NOTE_ZOOM_PRESETS.length - 1, index + direction));
  return NOTE_ZOOM_PRESETS[nextIndex] / 100;
}

export function useNoteZoomController(
  stageRef: RefObject<HTMLElement | null>,
  currentZoom: number,
  setZoom: (zoom: number) => void,
  fitToView: () => void,
) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const preserveAnchor = (nextZoom: number) => {
      const paper = stage.querySelector<HTMLElement>(".note-paper");
      const oldWidth = paper?.offsetWidth || 1;
      const oldHeight = paper?.offsetHeight || 1;
      const oldLeft = paper?.offsetLeft || 0;
      const oldTop = paper?.offsetTop || 0;
      const focusX = (stage.scrollLeft + stage.clientWidth / 2 - oldLeft) / oldWidth;
      const focusY = (stage.scrollTop + stage.clientHeight / 2 - oldTop) / oldHeight;
      setZoom(nextZoom);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const nextPaper = stage.querySelector<HTMLElement>(".note-paper");
        if (!nextPaper) return;
        stage.scrollLeft = Math.max(0, nextPaper.offsetLeft + focusX * nextPaper.offsetWidth - stage.clientWidth / 2);
        stage.scrollTop = Math.max(0, nextPaper.offsetTop + focusY * nextPaper.offsetHeight - stage.clientHeight / 2);
      }));
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      preserveAnchor(nextNoteZoom(currentZoom, event.deltaY < 0 ? 1 : -1));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (!["+", "=", "-", "0"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "0") fitToView();
      else preserveAnchor(nextNoteZoom(currentZoom, event.key === "-" ? -1 : 1));
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("keydown", onKeyDown);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKeyDown);
    };
  }, [currentZoom, fitToView, setZoom, stageRef]);
}
