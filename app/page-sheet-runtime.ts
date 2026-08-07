import { normalizePageSheetModel } from "./page-sheet-state";
import { handleNavigatorChange, handleNavigatorClick, injectStyle, mountNavigator } from "./page-sheet-navigation";
import { handleLibraryCustomActions, regroupLibraryTree } from "./page-sheet-library-ui";

function init() {
  injectStyle();
  normalizePageSheetModel();
  document.addEventListener("click", handleNavigatorClick, true);
  document.addEventListener("change", handleNavigatorChange, true);
  document.addEventListener("click", handleLibraryCustomActions, true);

  let scheduled = false;
  const scheduleMaintenance = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      // Do not rebuild an existing navigator in response to its own DOM changes.
      // The previous unconditional mount caused a feedback loop where the whole
      // sidebar was replaced while a finger/click was targeting a button.
      if (!document.querySelector(".mednote-page-sheet-nav")) mountNavigator();
      regroupLibraryTree();
    });
  };

  new MutationObserver(scheduleMaintenance).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", scheduleMaintenance, { once: true })
    : scheduleMaintenance();

  window.setInterval(() => {
    const changed = normalizePageSheetModel();
    if (changed || !document.querySelector(".mednote-page-sheet-nav")) mountNavigator();
    regroupLibraryTree();
  }, 1200);
}

init();
export {};
