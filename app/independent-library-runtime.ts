import "./independent-library-repair";
import "./native-library-three-groups";

// Keep the original relation-library synchronizer alive because the note sidebar
// depends on its bootstrap/timing side effects. library-panel-fix.css keeps the
// experimental replacement drawer hidden, so the React-owned 3-column Library
// remains the visible drawer.
void import("./independent-library-ui");

void import("./relation-note-sidebar")
  .then(() => import("./relation-note-hide-native-thumbnails"))
  .then(() => import("./relation-note-right-layout"))
  .then(() => import("./relation-navigation-collapse"))
  .then(() => import("./page-sheet-runtime"))
  .then(() => import("./page-sheet-sidebar-clean"))
  .then(() => import("./page-sheet-sidebar-functional-only"))
  .then(() => import("./pdf-search-toolbar-runtime"))
  .then(() => import("./page-sheet-toolbar-actions"));

export {};
