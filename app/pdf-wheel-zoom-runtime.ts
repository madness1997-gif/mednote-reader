type PendingZoom = {
  accumulator: number;
  clientX: number;
  clientY: number;
  running: boolean;
};

const WHEEL_THRESHOLD = 60;
const pendingByStage = new WeakMap<HTMLElement, PendingZoom>();

function readerStageFromTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".document-stage") : null;
}

function getZoomButton(stage: HTMLElement, direction: -1 | 1) {
  const buttons = stage.closest(".reader-pane")?.querySelectorAll<HTMLButtonElement>(".zoom-control button");
  if (!buttons || buttons.length < 2) return null;
  return direction > 0 ? buttons[buttons.length - 1] : buttons[0];
}

function pageSurfaces(stage: HTMLElement) {
  return Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page-surface, .document-paper"));
}

function surfaceAnchor(stage: HTMLElement, clientX: number, clientY: number) {
  const surfaces = pageSurfaces(stage);
  if (!surfaces.length) return null;

  let index = surfaces.findIndex((surface) => {
    const rect = surface.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });

  if (index < 0) {
    index = surfaces.reduce((best, surface, current) => {
      const rect = surface.getBoundingClientRect();
      const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
      const bestRect = surfaces[best].getBoundingClientRect();
      const bestDistance = Math.hypot(clientX - (bestRect.left + bestRect.width / 2), clientY - (bestRect.top + bestRect.height / 2));
      return distance < bestDistance ? current : best;
    }, 0);
  }

  const rect = surfaces[index].getBoundingClientRect();
  return {
    index,
    x: rect.width > 0 ? (clientX - rect.left) / rect.width : .5,
    y: rect.height > 0 ? (clientY - rect.top) / rect.height : .5,
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function performZoom(stage: HTMLElement, direction: -1 | 1, clientX: number, clientY: number) {
  const button = getZoomButton(stage, direction);
  if (!button || button.disabled) return;

  const anchor = surfaceAnchor(stage, clientX, clientY);
  const stageRect = stage.getBoundingClientRect();
  const localX = clientX - stageRect.left;
  const localY = clientY - stageRect.top;
  const oldScrollWidth = Math.max(1, stage.scrollWidth);
  const oldScrollHeight = Math.max(1, stage.scrollHeight);
  const oldContentX = stage.scrollLeft + localX;
  const oldContentY = stage.scrollTop + localY;

  button.click();
  await nextFrame();
  await nextFrame();

  if (anchor) {
    const surface = pageSurfaces(stage)[anchor.index];
    if (surface) {
      const rect = surface.getBoundingClientRect();
      stage.scrollLeft += rect.left + anchor.x * rect.width - clientX;
      stage.scrollTop += rect.top + anchor.y * rect.height - clientY;
      return;
    }
  }

  const ratioX = stage.scrollWidth / oldScrollWidth;
  const ratioY = stage.scrollHeight / oldScrollHeight;
  stage.scrollLeft = Math.max(0, oldContentX * ratioX - localX);
  stage.scrollTop = Math.max(0, oldContentY * ratioY - localY);
}

function processPending(stage: HTMLElement, pending: PendingZoom) {
  if (pending.running || Math.abs(pending.accumulator) < WHEEL_THRESHOLD) return;
  const direction: -1 | 1 = pending.accumulator < 0 ? 1 : -1;
  pending.accumulator = 0;
  pending.running = true;
  void performZoom(stage, direction, pending.clientX, pending.clientY).finally(() => {
    pending.running = false;
    processPending(stage, pending);
  });
}

document.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const stage = readerStageFromTarget(event.target);
  if (!stage) return;

  event.preventDefault();
  event.stopPropagation();

  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? stage.clientHeight
      : 1;
  const delta = event.deltaY * multiplier;
  let pending = pendingByStage.get(stage);
  if (!pending) {
    pending = { accumulator: 0, clientX: event.clientX, clientY: event.clientY, running: false };
    pendingByStage.set(stage, pending);
  }

  if (pending.accumulator !== 0 && Math.sign(pending.accumulator) !== Math.sign(delta)) pending.accumulator = 0;
  pending.accumulator += delta;
  pending.clientX = event.clientX;
  pending.clientY = event.clientY;
  processPending(stage, pending);
}, { capture: true, passive: false });

export {};
