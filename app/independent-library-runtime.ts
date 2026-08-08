import "./independent-library-repair";
import "./native-library-three-groups";

// Keep the relation/note-side functionality, but do not replace the native library drawer.
// The native drawer is React-owned and is therefore much more reliable on mobile.
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
