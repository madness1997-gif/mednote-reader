import { escapeHtml } from "./relation-library-ui-base";

export function createModal(panel: HTMLElement, title: string, body: string, actions: string) {
  panel.querySelector(".rl-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "rl-modal-backdrop";
  backdrop.innerHTML = `<section class="rl-modal"><header class="rl-modal-head"><strong>${escapeHtml(title)}</strong><button class="rl-close" data-modal-close>✕</button></header><div class="rl-modal-body">${body}</div><footer class="rl-modal-actions">${actions}</footer></section>`;
  backdrop.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-modal-close]") || event.target === backdrop) backdrop.remove();
  });
  panel.append(backdrop);
  return backdrop;
}
