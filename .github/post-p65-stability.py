from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, marker: str, block: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if marker in text:
        return
    file.write_text(text.rstrip() + "\n\n" + block.strip() + "\n", encoding="utf-8")


# 1. Temporary PDF sessions must remember the exact Page/Sheet destination until Save Library.
replace_once(
    "app/document-library-controller.ts",
    '  private readonly temporaryPdfs = new Map<string, StoredPdf>();\n',
    '  private readonly temporaryPdfs = new Map<string, StoredPdf>();\n'
    '  private readonly temporaryNoteTargets = new Map<string, { notebookId: string; target: LinkedNoteTarget }>();\n',
)

replace_once(
    "app/document-library-controller.ts",
    '''    try {\n      const resolved = await this.resolveDestination(destination, name);\n      selectedNotebookId = resolved.notebookId;\n      selectedTarget = resolved.target;\n    } catch (error) {\n      warning = error instanceof Error ? error.message : "Không thể tạo vị trí note";\n    }\n\n    const placeholder = createReaderPlaceholder(workspaceId);\n''',
    '''    try {\n      const resolved = await this.resolveDestination(destination, name);\n      selectedNotebookId = resolved.notebookId;\n      selectedTarget = resolved.target;\n    } catch (error) {\n      warning = error instanceof Error ? error.message : "Không thể tạo vị trí note";\n    }\n\n    if (!input.saveToLibrary) {\n      this.temporaryNoteTargets.clear();\n      if (selectedNotebookId && selectedTarget) {\n        this.temporaryNoteTargets.set(workspaceId, { notebookId: selectedNotebookId, target: selectedTarget });\n      }\n    }\n\n    const placeholder = createReaderPlaceholder(workspaceId);\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''    const temporary = input.workspaces.find((workspace) => workspace.id === input.workspaceId);\n    if (!temporary || temporary.kind !== "temporary") throw new Error("Không tìm thấy phiên PDF tạm");\n    const documents = temporary.documents.map((document) => ({\n''',
    '''    const temporary = input.workspaces.find((workspace) => workspace.id === input.workspaceId);\n    if (!temporary || temporary.kind !== "temporary") throw new Error("Không tìm thấy phiên PDF tạm");\n    const pendingNoteTarget = this.temporaryNoteTargets.get(temporary.id);\n    const documents = temporary.documents.map((document) => ({\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''      const workspaces = input.workspaces.filter((workspace) => workspace.id !== temporary.id);\n      this.temporaryPdfs.clear();\n      const savedAt = this.persist(workspaces, existing.id, input);\n''',
    '''      const workspaces = input.workspaces.filter((workspace) => workspace.id !== temporary.id);\n      this.temporaryPdfs.clear();\n      this.temporaryNoteTargets.delete(temporary.id);\n      const savedAt = this.persist(workspaces, existing.id, input);\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''    const structure = this.notes.getSnapshot().structure;\n    const linkedPageId = structure && savedWorkspace.noteNotebookId\n      ? structure.pages.find((page) => structure.sections.find((section) => section.id === page.sectionId)?.notebookId === savedWorkspace.noteNotebookId)?.id\n      : null;\n    let graphSaved = false;\n    try {\n      await this.notes.saveDocumentWorkspace(documentWorkspaceInput(\n        savedWorkspace,\n        linkedPageId ? { targetType: "page", targetId: linkedPageId } : null,\n        { workspaceMode: linkedPageId ? "split" : "reader", readerShare: input.readerShare, noteZoom: input.noteZoom },\n      ));\n''',
    '''    const structure = this.notes.getSnapshot().structure;\n    const pendingTargetExists = Boolean(structure && pendingNoteTarget && (pendingNoteTarget.target.targetType === "page"\n      ? structure.pages.some((page) => page.id === pendingNoteTarget.target.targetId)\n      : structure.sheets.some((sheet) => sheet.id === pendingNoteTarget.target.targetId)));\n    const fallbackLinkedPageId = structure && savedWorkspace.noteNotebookId\n      ? structure.pages.find((page) => structure.sections.find((section) => section.id === page.sectionId)?.notebookId === savedWorkspace.noteNotebookId)?.id\n      : null;\n    const linkedTarget = pendingNoteTarget\n      && pendingNoteTarget.notebookId === savedWorkspace.noteNotebookId\n      && pendingTargetExists\n      ? pendingNoteTarget.target\n      : fallbackLinkedPageId ? { targetType: "page" as const, targetId: fallbackLinkedPageId } : null;\n    let graphSaved = false;\n    try {\n      await this.notes.saveDocumentWorkspace(documentWorkspaceInput(\n        savedWorkspace,\n        linkedTarget,\n        { workspaceMode: linkedTarget ? "split" : "reader", readerShare: input.readerShare, noteZoom: input.noteZoom },\n      ));\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''    const savedAt = this.persist(workspaces, workspaceId, { ...input, workspaceMode });\n    this.temporaryPdfs.clear();\n    return {\n''',
    '''    const savedAt = this.persist(workspaces, workspaceId, { ...input, workspaceMode });\n    this.temporaryPdfs.clear();\n    this.temporaryNoteTargets.delete(temporary.id);\n    return {\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''    if (target.kind === "temporary") {\n      target.documents.forEach((document) => this.temporaryPdfs.delete(document.id));\n    } else {\n''',
    '''    if (target.kind === "temporary") {\n      target.documents.forEach((document) => this.temporaryPdfs.delete(document.id));\n      this.temporaryNoteTargets.delete(target.id);\n    } else {\n''',
)

# 2. Drive preferences must represent the note runtime explicitly with an empty document context.
replace_once(
    "app/drive-sync-service.ts",
    '''      const activeDocumentContextId = documentWorkspaces.some((workspace) => workspace.id === snapshot.activeWorkspaceId)\n        ? snapshot.activeWorkspaceId\n        : documentWorkspaces[0]?.id || "";\n''',
    '''      const activeDocumentContextId = snapshot.activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID\n        ? ""\n        : documentWorkspaces.some((workspace) => workspace.id === snapshot.activeWorkspaceId)\n          ? snapshot.activeWorkspaceId\n          : "";\n''',
)

# Regression: exact Page/Sheet target survives temporary -> persistent conversion.
append_once(
    "tests-unit/document-library-controller.test.ts",
    'temporary Save Library preserves the exact Page or Sheet destination',
    r'''test("temporary Save Library preserves the exact Page or Sheet destination", async () => {
  for (const targetType of ["page", "sheet"] as const) {
    const context = await harness();
    try {
      context.controller.activate();
      const second = await context.notes.createPage("sec", `Second ${targetType}`, {});
      const target = targetType === "page"
        ? { targetType, targetId: second.active.activePageId }
        : { targetType, targetId: second.active.activeSheetId };
      const temporary = await context.controller.importPdfFiles({
        ...baseInput([pdf(`Temp-${targetType}.pdf`)]),
        saveToLibrary: false,
        destination: { mode: "existing", notebookId: "nb", target },
      });
      assert.equal((await context.repository.loadDocumentGraph())?.links.length, 0);
      const saved = await context.controller.saveTemporaryWorkspace({
        workspaceId: temporary.activeWorkspaceId,
        workspaces: temporary.workspaces,
        activeWorkspaceId: temporary.activeWorkspaceId,
        hasActiveNote: true,
        readerShare: 46,
        workspaceMode: temporary.workspaceMode,
        noteZoom: 1.15,
      });
      assert.notEqual(saved.activeWorkspaceId, temporary.activeWorkspaceId);
      const graph = await context.repository.loadDocumentGraph();
      assert.equal(graph?.links.length, 1);
      assert.equal(graph?.links[0].targetType, target.targetType);
      assert.equal(graph?.links[0].targetId, target.targetId);
    } finally { await context.close(); }
  }
});''',
)

# Regression: a Drive round-trip must not jump from note-only runtime to the first PDF context.
replace_once(
    "tests-unit/drive-sync-service.test.ts",
    '''  DEFAULT_READER,\n  workspacesFromLibraryV6,\n''',
    '''  DEFAULT_READER,\n  NOTE_RUNTIME_WORKSPACE_ID,\n  workspacesFromLibraryV6,\n''',
)

append_once(
    "tests-unit/drive-sync-service.test.ts",
    'Drive v2 preserves the note runtime as active even when documents exist',
    r'''test("Drive v2 preserves the note runtime as active even when documents exist", async () => {
  const remote = new MemoryDrive();
  const web = await harness(library({ body: "note runtime", withAsset: false }), remote);
  const desktop = await harness(library({ body: "old desktop", withAsset: false, documentName: "Old.pdf" }), remote);
  try {
    web.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["shared-pdf"], { type: "application/pdf" }) });
    await web.service.sync("web-token", {
      ...web.snapshot,
      activeWorkspaceId: NOTE_RUNTIME_WORKSPACE_ID,
      workspaceMode: "note",
    });
    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    const canonical = parseDriveBackup(JSON.parse(await manifest.blob.text()));
    assert.equal(canonical.preferences.activeDocumentContextId, "");

    const restored = await desktop.service.restore("desktop-token");
    assert.equal(restored.snapshot.activeWorkspaceId, NOTE_RUNTIME_WORKSPACE_ID);
    assert.equal(restored.snapshot.workspaceMode, "note");
    const local = await desktop.repository.loadLibrary();
    assert.equal(local?.notes.notebooks.length, 1);
    assert.equal(local?.documents.contexts.length, 1);
    assert.equal(local?.documents.links.length, 1);
  } finally {
    await web.close();
    await desktop.close();
  }
});''',
)

print("post-P6.5 stabilization patch applied")
