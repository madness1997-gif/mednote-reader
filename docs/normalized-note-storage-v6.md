# Normalized note storage v6 contract

Status: Wave 1.5 foundation. Production runtime must not use this repository until the Wave 2 store cutover is implemented and audited.

## Record ownership

| Key | Owns | Must not contain |
|---|---|---|
| `library:v6:meta` | Record IDs, active note IDs, preferences, `savedAt` | Entity titles, hierarchy copies, Sheet content |
| `library:v6:workspace` | Workspace identity/title | Nested hierarchy |
| `library:v6:notebook:<id>` | Notebook metadata | Sections or Pages |
| `library:v6:section:<id>` | Section metadata and `notebookId` | Page IDs |
| `library:v6:page:<id>` | Page metadata and `sectionId` | Sheet IDs or content |
| `library:v6:sheet:<id>` | Sheet metadata: `id`, `pageId`, `order` | Editor content and navigation titles |
| `library:v6:sheet-content:<id>` | Editor content for exactly one Sheet | `id`, title, parent IDs, order, lazy flags |
| Document/link keys | PDF metadata and PDF-to-note relations | Note hierarchy ownership |

`meta.sheetIds` is the authoritative list for both Sheet metadata and SheetContent records. There is no separate Sheet index or copied `pageId/order` map.

## Read boundaries

- `loadNoteStructure()` reads only meta, Workspace, Notebook, Section, Page and Sheet metadata records.
- `loadSheetContent(sheetId)` reads meta plus exactly one SheetContent record.
- `loadSheet(sheetId)` joins one Sheet metadata record with one SheetContent record at the repository boundary.
- `loadDocumentGraph()` may read note structure to validate link targets, but must not read SheetContent.
- `loadLibrary()` is deliberately eager and is reserved for migration, backup/export, sync bundles and full integrity verification. It is not a startup/store API.

## Write invariants

- Hierarchy rename, move, reorder and active-state mutations never read or write SheetContent.
- `saveSheetContent()` never rewrites Sheet metadata.
- Creating or deleting a Sheet writes/deletes its metadata and content records in the same IndexedDB transaction.
- Deleting Page/Section/Notebook cascades Sheet metadata, SheetContent and orphaned links in the same transaction.
- Every Sheet has exactly one SheetContent record; missing or orphan content fails full-library validation.
- `savedAt` advances monotonically for every successful mutation.

## Migration and cutover

- v3/v4/v5 content hashes are calculated before persistence and verified again after v6 reload.
- v5 and relation-v2 remain read-only fallback sources; Wave 1.5 does not delete them.
- A relation, group, preset or locator that cannot round-trip blocks the v6 marker write.
- Wave 2 may start only when the large-fixture gate proves that structure loading reads zero `sheet-content:*` keys and the production runtime still has no import of the v6 repository.
