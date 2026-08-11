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


# Reuse one validation rule for transient Page/Sheet targets.
replace_once(
    "app/document-library-controller.ts",
    '''  private sessionId() {\n    return `session-${this.now()}-${this.random().toString(16).slice(2)}`;\n  }\n\n  private persist(\n''',
    '''  private sessionId() {\n    return `session-${this.now()}-${this.random().toString(16).slice(2)}`;\n  }\n\n  private noteTargetExists(target: LinkedNoteTarget | undefined) {\n    const structure = this.notes.getSnapshot().structure;\n    if (!structure || !target) return false;\n    return target.targetType === "page"\n      ? structure.pages.some((page) => page.id === target.targetId)\n      : structure.sheets.some((sheet) => sheet.id === target.targetId);\n  }\n\n  private persist(\n''',
)

# If a temporary PDF resolves to an already-persisted document, merge the new exact link before remapping the excerpts.
replace_once(
    "app/document-library-controller.ts",
    '''    const existing = input.workspaces.find((workspace) => workspace.id === workspaceId);\n    if (existing) {\n      await this.notes.remapDocumentReferences(idMap);\n      const workspaces = input.workspaces.filter((workspace) => workspace.id !== temporary.id);\n      this.temporaryPdfs.clear();\n      this.temporaryNoteTargets.delete(temporary.id);\n      const savedAt = this.persist(workspaces, existing.id, input);\n      return {\n        workspaces,\n        activeWorkspaceId: existing.id,\n        workspaceMode: input.workspaceMode,\n        savedAt,\n        message: "PDF này đã có trong thư viện; nguồn note đã được nối lại",\n      };\n    }\n''',
    '''    const existing = input.workspaces.find((workspace) => workspace.id === workspaceId);\n    if (existing) {\n      const reconnectTarget = pendingNoteTarget\n        && pendingNoteTarget.notebookId === temporary.noteNotebookId\n        && this.noteTargetExists(pendingNoteTarget.target)\n        ? pendingNoteTarget.target\n        : null;\n      if (reconnectTarget && existing.documents.length) {\n        await this.notes.saveDocumentWorkspace(documentWorkspaceInput(existing, reconnectTarget, {\n          workspaceMode: "split",\n          readerShare: input.readerShare,\n          noteZoom: input.noteZoom,\n        }));\n      }\n      await this.notes.remapDocumentReferences(idMap);\n      const workspaces = input.workspaces.filter((workspace) => workspace.id !== temporary.id);\n      this.temporaryPdfs.clear();\n      this.temporaryNoteTargets.delete(temporary.id);\n      const workspaceMode: WorkspaceMode = reconnectTarget ? "split" : input.workspaceMode;\n      const savedAt = this.persist(workspaces, existing.id, { ...input, workspaceMode });\n      return {\n        workspaces,\n        activeWorkspaceId: existing.id,\n        workspaceMode,\n        savedAt,\n        message: reconnectTarget\n          ? "PDF này đã có trong thư viện; nguồn note và liên kết đã được nối lại"\n          : "PDF này đã có trong thư viện; nguồn note đã được nối lại",\n      };\n    }\n''',
)

replace_once(
    "app/document-library-controller.ts",
    '''    const structure = this.notes.getSnapshot().structure;\n    const pendingTargetExists = Boolean(structure && pendingNoteTarget && (pendingNoteTarget.target.targetType === "page"\n      ? structure.pages.some((page) => page.id === pendingNoteTarget.target.targetId)\n      : structure.sheets.some((sheet) => sheet.id === pendingNoteTarget.target.targetId)));\n    const fallbackLinkedPageId = structure && savedWorkspace.noteNotebookId\n''',
    '''    const structure = this.notes.getSnapshot().structure;\n    const pendingTargetExists = this.noteTargetExists(pendingNoteTarget?.target);\n    const fallbackLinkedPageId = structure && savedWorkspace.noteNotebookId\n''',
)

# Canonical note edits/hierarchy changes must debounce Drive auto-sync even when WorkspaceItem does not change.
replace_once(
    "app/page.tsx",
    '''  }, [activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces]);\n''',
    '''  }, [activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces, noteState.activeSheetContent, noteState.structure]);\n''',
)

append_once(
    "tests-unit/document-library-controller.test.ts",
    'temporary duplicate PDF merges its new exact note link into the existing DocumentGraph',
    r'''test("temporary duplicate PDF merges its new exact note link into the existing DocumentGraph", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const file = pdf("Existing.pdf", "same-body", 77);
    const persisted = await context.controller.importPdfFiles(baseInput([file]));
    const second = await context.notes.createPage("sec", "Second target", {});
    const target = { targetType: "sheet" as const, targetId: second.active.activeSheetId };
    const temporary = await context.controller.importPdfFiles({
      ...baseInput([file], persisted.workspaces),
      saveToLibrary: false,
      activeWorkspaceId: persisted.activeWorkspaceId,
      destination: { mode: "existing", notebookId: "nb", target },
    });
    const saved = await context.controller.saveTemporaryWorkspace({
      workspaceId: temporary.activeWorkspaceId,
      workspaces: temporary.workspaces,
      activeWorkspaceId: temporary.activeWorkspaceId,
      hasActiveNote: true,
      readerShare: 46,
      workspaceMode: temporary.workspaceMode,
      noteZoom: 1.15,
    });
    assert.equal(saved.activeWorkspaceId, persisted.activeWorkspaceId);
    assert.equal(saved.workspaceMode, "split");
    const graph = await context.repository.loadDocumentGraph();
    assert.ok(graph?.links.some((link) => link.targetType === target.targetType && link.targetId === target.targetId));
    assert.equal(graph?.documents.length, 1);
    assert.equal(graph?.contexts.length, 1);
  } finally { await context.close(); }
});''',
)

append_once(
    "tests-unit/drive-sync-service.test.ts",
    'Drive auto-sync watches canonical NoteStore content and hierarchy changes',
    r'''test("Drive auto-sync watches canonical NoteStore content and hierarchy changes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(
    page,
    /\[activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces, noteState\.activeSheetContent, noteState\.structure\]/,
  );
});''',
)

print("post-P6.5 stabilization follow-up patch applied")
