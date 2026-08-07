import "./independent-library-repair";
import "./relation-library-compact-labels";
void import("./independent-library-ui");
void import("./relation-note-sidebar")
  .then(() => import("./relation-note-hide-native-thumbnails"))
  .then(() => import("./relation-note-right-layout"))
  .then(() => import("./relation-navigation-collapse"))
  .then(() => import("./page-sheet-runtime"))
  .then(() => import("./relation-library-names-only"))
  .then(() => import("./page-sheet-sidebar-clean"));
export {};
