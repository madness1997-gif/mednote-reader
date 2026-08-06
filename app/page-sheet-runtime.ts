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
  const scheduleMount = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      mountNavigator();
      regroupLibraryTree();
    });
  };
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", scheduleMount, { once: true }) : scheduleMount();
  window.setInterval(() => {
    const changed = normalizePageSheetModel();
    if (changed || !document.querySelector(".mednote-page-sheet-nav")) mountNavigator();
    regroupLibraryTree();
  }, 1200);
}

init();
export {};
