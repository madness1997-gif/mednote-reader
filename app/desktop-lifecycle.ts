import { noteStore, type NoteStore } from "./note-store";

let installed = false;

export function installDesktopLifecycle(store: NoteStore = noteStore) {
  if (installed || !window.mednoteDesktop?.isDesktop || !window.mednoteDesktop.onFlushRequested) return;
  installed = true;
  window.mednoteDesktop.onFlushRequested(async (requestId) => {
    try {
      await store.flush();
      window.mednoteDesktop?.completeFlush(requestId, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu note trước khi đóng";
      window.mednoteDesktop?.completeFlush(requestId, false, message);
    }
  });
}
