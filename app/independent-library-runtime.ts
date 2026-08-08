import "./independent-library-repair";
import "./native-library-three-groups";
import "./page-sheet-active-context-repair";

// Keep the original relation-library synchronizer alive because note/library
// relations still depend on its bootstrap/timing side effects. The visible
// Library remains the React-owned 3-column drawer.
void import("./independent-library-ui");

// The Page → Sheet navigator is the single note sidebar implementation.
void import("./relation-note-right-layout")
  .then(() => import("./relation-navigation-collapse"))
  .then(() => import("./page-sheet-runtime"))
  .then(() => import("./page-sheet-sidebar-clean"))
  .then(() => import("./page-sheet-sidebar-functional-only"))
  .then(() => import("./pdf-search-toolbar-runtime"))
  .then(() => import("./page-sheet-toolbar-actions"));

export {};
