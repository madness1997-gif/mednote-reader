import "./independent-library-repair";
import "./native-library-three-groups";
import "./page-sheet-active-context-repair";

// Keep the original relation-library synchronizer alive because note/library
// relations still depend on its bootstrap/timing side effects. The visible
// Library remains the React-owned 3-column drawer.
void import("./independent-library-ui");

// The Page → Sheet navigator is the single note sidebar implementation.
// IMPORTANT: load the core navigator independently. The previous chained
// dynamic imports meant that if any layout/collapse decorator failed to import
// on a specific browser/session, page-sheet-runtime never ran at all and the
// React host remained as an empty white strip. Core navigation must not depend
// on optional UI decorators succeeding first.
void import("./page-sheet-runtime").catch((error) => {
  console.error("[MedNote] OneNote sidebar runtime failed to load", error);
});

// Nonessential layout/interaction decorators are isolated from one another so
// one failure cannot prevent the actual sidebar from mounting.
void import("./relation-note-right-layout").catch((error) => console.error("[MedNote] note sidebar right layout failed", error));
void import("./relation-navigation-collapse").catch((error) => console.error("[MedNote] note sidebar collapse controls failed", error));
void import("./page-sheet-sidebar-clean").catch((error) => console.error("[MedNote] note sidebar styling failed", error));
void import("./page-sheet-sidebar-functional-only").catch((error) => console.error("[MedNote] note sidebar functional controls failed", error));
void import("./pdf-search-toolbar-runtime").catch((error) => console.error("[MedNote] PDF search toolbar failed", error));
void import("./page-sheet-toolbar-actions").catch((error) => console.error("[MedNote] page sheet toolbar actions failed", error));

export {};
