import type { LibraryV6 } from "../app/note-repository";

export function createV6LibraryFixture(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb-endo", title: "Nội tiết", order: 0 }],
      sections: [
        { id: "sec-diabetes", notebookId: "nb-endo", title: "Đái tháo đường", order: 0 },
        { id: "sec-thyroid", notebookId: "nb-endo", title: "Tuyến giáp", order: 1 },
      ],
      pages: [
        { id: "page-dm", sectionId: "sec-diabetes", title: "Điều trị ĐTĐ", order: 0 },
        { id: "page-thyroid", sectionId: "sec-thyroid", title: "Cường giáp", order: 0 },
      ],
      sheets: [
        { id: "sheet-dm-1", pageId: "page-dm", order: 0 },
        { id: "sheet-dm-2", pageId: "page-dm", order: 1 },
        { id: "sheet-thyroid-1", pageId: "page-thyroid", order: 0 },
      ],
      active: {
        activeNotebookId: "nb-endo",
        activeSectionId: "sec-diabetes",
        activePageId: "page-dm",
        activeSheetId: "sheet-dm-2",
      },
    },
    sheetContents: {
      "sheet-dm-1": {
        body: "Metformin là lựa chọn nền tảng",
        bodyHtml: "<p>Metformin là lựa chọn nền tảng</p>",
        strokes: [{ id: "stroke-1", points: [[1, 2], [3, 4]] }],
        excerpts: [{ id: "excerpt-1", kind: "text", text: "ADA 2026" }],
        paper: { size: "a4", template: "first-aid" },
      },
      "sheet-dm-2": {
        body: "SGLT2i ưu tiên khi có CKD hoặc HF",
        bodyHtml: "<p>SGLT2i ưu tiên khi có CKD hoặc HF</p>",
        strokes: [],
        excerpts: [{ id: "image-1", kind: "image", assetId: "asset-1" }],
        firstAidBlocks: [{ id: "fa-1", label: "ĐIỀU TRỊ", content: "Cá thể hóa" }],
      },
      "sheet-thyroid-1": {
        body: "Thyrozol",
        bodyHtml: "<p>Thyrozol</p>",
        strokes: [],
        excerpts: [],
      },
    },
    documents: {
      documents: [
        {
          id: "doc-ada",
          name: "ADA-2026.pdf",
          size: 1000,
          lastModified: 1786258700000,
          available: true,
          payload: { reader: { page: 12, zoom: 1.25 } },
        },
        {
          id: "doc-idsa",
          name: "IDSA-AMR-2026.pdf",
          size: 2000,
          lastModified: 1786258701000,
          available: true,
          payload: { reader: { page: 3, zoom: 1 } },
        },
      ],
      contexts: [{
        id: "context-ada",
        kind: "document",
        name: "ADA Standards",
        documentIds: ["doc-ada", "doc-idsa"],
        activeDocumentId: "doc-ada",
        sourcePage: 12,
      }],
      groups: [],
      links: [
        { id: "link-page-dm", documentId: "doc-idsa", targetType: "page", targetId: "page-dm" },
        { id: "link-sheet-dm-2", documentId: "doc-ada", targetType: "sheet", targetId: "sheet-dm-2" },
      ],
      linkRelations: [],
    },
    preferences: {
      activeDocumentContextId: "context-ada",
      readerShare: 48,
      workspaceMode: "split",
      noteZoom: 1.1,
    },
    savedAt: 1786258800000,
  };
}
