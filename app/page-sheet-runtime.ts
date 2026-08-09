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
      // Replacing the navigator destroys transient UI such as Search, Recent Notes,
      // the notebook picker and open menus while the user is interacting with them.
      mountNavigator();
      regroupLibraryTree();
    });
  };

  new MutationObserver(scheduleMaintenance).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", scheduleMaintenance, { once: true })
    : scheduleMaintenance();

  window.addEventListener("mednote-live-state-changed", scheduleMaintenance);
  window.addEventListener("mednote-note-context-changed", scheduleMaintenance);

  window.setInterval(() => {
    // Normalization is background data maintenance only. Never use its `changed`
    // result as a reason to replace the live sidebar DOM. All user-visible model
    // changes already navigate/reload through the action handlers, while replacing
    // the DOM here made utility panels disappear after a few seconds.
    normalizePageSheetModel();
    mountNavigator();
    regroupLibraryTree();
  }, 1200);
}

init();
export {};
