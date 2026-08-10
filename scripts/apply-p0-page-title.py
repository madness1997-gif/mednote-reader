from pathlib import Path

page_path = Path("app/page.tsx")
page = page_path.read_text()


def replace_once(old: str, new: str, label: str):
    global page
    count = page.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    page = page.replace(old, new, 1)


replace_once(
    'import NoteSidebar from "./note-sidebar";\n',
    'import NoteSidebar from "./note-sidebar";\nimport PageTitleEditor from "./page-title-editor";\n',
    "PageTitleEditor import",
)
replace_once(
    "type NoteExcerpt = {",
    'type NotePageContentPatch = Partial<Omit<NotePage, "id" | "title" | "titleHtml" | "__mednoteLazyPage">>;\n\ntype NoteExcerpt = {',
    "content-only patch type",
)
replace_once(
    "const updateActiveNote = (changes: Partial<NotePage>) => {",
    "const updateActiveNote = (changes: NotePageContentPatch) => {",
    "updateActiveNote signature",
)
replace_once('    titleHtml: pageTitle,\n', "", "notePageFromSheet titleHtml")
replace_once('  page.titleHtml = "Reader";\n', "", "reader placeholder titleHtml")
replace_once(
    '            <div className="note-title-input" dangerouslySetInnerHTML={{ __html: note.titleHtml ?? plainTextToRichHtml(note.title) }} />',
    '            <div className="note-title-input">{note.title}</div>',
    "continuous preview title",
)
replace_once(
    '      pagesHtml.push(`<section><h2>${index + 1}. ${page.titleHtml ? sanitizeRichTextHtml(page.titleHtml) : escapeHtml(page.title)}</h2><div class="body" style="${textStyle}">${page.bodyHtml ?? plainTextToRichHtml(page.body)}</div>${excerptsHtml.join("")}</section>`);',
    '      pagesHtml.push(`<section><h2>${index + 1}. ${escapeHtml(page.title)}</h2><div class="body" style="${textStyle}">${page.bodyHtml ?? plainTextToRichHtml(page.body)}</div>${excerptsHtml.join("")}</section>`);',
    "export title source",
)

old_first_aid = '''    updateActiveNote({
      paper: { ...activeNote.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
      text: { ...activeNote.text, font: "times", size: 12, align: "left" },
      ...(shouldSeed ? {
        title: replaceDefaultTitle ? "TÊN CHỦ ĐỀ" : activeNote.title,
        titleHtml: replaceDefaultTitle ? undefined : activeNote.titleHtml,
        bodyHtml: FIRST_AID_TEMPLATE_HTML,
        body: FIRST_AID_TEMPLATE_TEXT,
      } : {}),
    });'''
new_first_aid = '''    updateActiveNote({
      paper: { ...activeNote.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
      text: { ...activeNote.text, font: "times", size: 12, align: "left" },
      ...(shouldSeed ? {
        bodyHtml: FIRST_AID_TEMPLATE_HTML,
        body: FIRST_AID_TEMPLATE_TEXT,
      } : {}),
    });
    if (shouldSeed && replaceDefaultTitle && activeLogicalPage?.id) {
      void noteStore.renamePage(activeLogicalPage.id, "TÊN CHỦ ĐỀ").catch((error) => {
        setToast(error instanceof Error ? error.message : "Không thể đổi tên Page");
      });
    }'''
replace_once(old_first_aid, new_first_aid, "First Aid title ownership")

old_canvas = '''                <RichTextEditor key={`title:${activeNote.id}`} editorId={`title:${activeNote.id}`} className="note-title-input" html={activeNote.titleHtml ?? plainTextToRichHtml(activeNote.title)} editable={activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer")} singleLine placeholder="Nhập tiêu đề" ariaLabel="Tiêu đề ghi chú" onChange={(titleHtml, title) => updateActiveNote({ titleHtml, title })} onActivate={(editorId, editor, range) => {
                  if (activeNote.paper.template === "first-aid" && activeTool === "pointer") {
                    setActiveTool("text");
                    setNotePanel("text");
                  }
                  activateTextEditor(editorId, editor, range);
                }} onNormalizeInput={normalizeTextEditorInput} />'''
new_canvas = '''                <PageTitleEditor
                  key={`page-title:${activeLogicalPage?.id ?? activeNote.id}`}
                  pageId={activeLogicalPage?.id ?? ""}
                  title={activeLogicalPage?.title ?? activeNote.title}
                  className="note-title-input"
                  editable={Boolean(activeLogicalPage?.id) && (activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer"))}
                  placeholder="Nhập tiêu đề"
                  ariaLabel="Tiêu đề ghi chú"
                  onActivate={() => {
                    if (activeNote.paper.template === "first-aid" && activeTool === "pointer") {
                      setActiveTool("text");
                      setNotePanel("text");
                    }
                  }}
                  onError={(message) => setToast(message)}
                />'''
replace_once(old_canvas, new_canvas, "canvas title editor")

page_path.write_text(page)

Path("app/page-title-editor.tsx").write_text(r'''"use client";

import { useCallback, useEffect, useRef } from "react";
import { noteStore } from "./note-store";

export const PAGE_TITLE_DEBOUNCE_MS = 280;

type PageTitleEditorProps = {
  pageId: string;
  title: string;
  className?: string;
  editable?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onActivate?: () => void;
  onError?: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể đổi tên Page";
}

export default function PageTitleEditor({
  pageId,
  title,
  className = "",
  editable = true,
  placeholder = "Nhập tiêu đề",
  ariaLabel = "Tiêu đề Page",
  onActivate,
  onError,
}: PageTitleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const pageIdRef = useRef(pageId);
  const draftRef = useRef(title);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commit = useCallback((targetPageId: string, nextTitle: string, revision: number) => {
    if (!targetPageId) return;
    if (pageIdRef.current === targetPageId && revisionRef.current === revision) dirtyRef.current = false;
    void noteStore.renamePage(targetPageId, nextTitle).then((result) => {
      if (pageIdRef.current !== targetPageId || revisionRef.current !== revision) return;
      const committedTitle = result.structure.pages.find((page) => page.id === targetPageId)?.title;
      if (committedTitle === undefined) return;
      draftRef.current = committedTitle;
      const editor = editorRef.current;
      if (editor && (document.activeElement !== editor || committedTitle !== nextTitle) && editor.textContent !== committedTitle) {
        editor.textContent = committedTitle;
      }
    }).catch((error) => {
      if (pageIdRef.current === targetPageId && revisionRef.current === revision) dirtyRef.current = true;
      onError?.(errorMessage(error));
    });
  }, [onError]);

  const flush = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current || !pageIdRef.current) return;
    commit(pageIdRef.current, draftRef.current, revisionRef.current);
  }, [clearTimer, commit]);

  const schedule = useCallback(() => {
    clearTimer();
    const targetPageId = pageIdRef.current;
    const nextTitle = draftRef.current;
    const revision = revisionRef.current;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!dirtyRef.current) return;
      commit(targetPageId, nextTitle, revision);
    }, PAGE_TITLE_DEBOUNCE_MS);
  }, [clearTimer, commit]);

  useEffect(() => {
    pageIdRef.current = pageId;
    revisionRef.current += 1;
    clearTimer();
    dirtyRef.current = false;
    draftRef.current = title;
    if (editorRef.current && editorRef.current.textContent !== title) editorRef.current.textContent = title;
  }, [clearTimer, pageId]);

  useEffect(() => {
    if (pageIdRef.current !== pageId) return;
    if (dirtyRef.current && document.activeElement === editorRef.current) return;
    draftRef.current = title;
    if (editorRef.current && editorRef.current.textContent !== title) editorRef.current.textContent = title;
  }, [pageId, title]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!dirtyRef.current || !pageIdRef.current) return;
    const targetPageId = pageIdRef.current;
    const nextTitle = draftRef.current;
    dirtyRef.current = false;
    void noteStore.renamePage(targetPageId, nextTitle).catch((error) => onError?.(errorMessage(error)));
  }, [onError]);

  return <div
    ref={editorRef}
    className={className}
    data-page-title-editor={pageId || undefined}
    data-placeholder={placeholder}
    role="textbox"
    aria-label={ariaLabel}
    aria-multiline="false"
    contentEditable={editable}
    suppressContentEditableWarning
    spellCheck={false}
    onFocus={onActivate}
    onInput={(event) => {
      draftRef.current = (event.currentTarget.textContent || "").replace(/[\r\n]+/g, " ");
      dirtyRef.current = true;
      revisionRef.current += 1;
      schedule();
    }}
    onBlur={flush}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      flush();
      event.currentTarget.blur();
    }}
    onPaste={(event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
      document.execCommand("insertText", false, text);
    }}
  />;
}
''')

test_path = Path("tests/note-hierarchy-actions.spec.cjs")
test_text = test_path.read_text()
old_segment = '''  await submitName(page, nav.getByRole('button', { name: 'Đổi tên Đái tháo đường' }), 'ĐTĐ type 2');
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
'''
new_segment = '''  await submitName(page, nav.getByRole('button', { name: 'Đổi tên Đái tháo đường' }), 'ĐTĐ type 2');
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');

  let titleEditor = page.locator('[data-page-title-editor]');
  await titleEditor.evaluate((element) => element.setAttribute('contenteditable', 'true'));
  await titleEditor.fill('ĐTĐ canvas');
  await titleEditor.blur();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toBeVisible();

  await nav.getByRole('button', { name: 'Thêm tờ vào ĐTĐ canvas' }).click();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toContainText('2 tờ');
  await nav.locator('.note-sidebar-sheet-open', { hasText: 'Tờ 2' }).click();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ canvas');

  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toContainText('2 tờ');
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ canvas');

  await submitName(page, nav.getByRole('button', { name: 'Đổi tên ĐTĐ canvas' }), 'ĐTĐ type 2');
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');
'''
if test_text.count(old_segment) != 1:
    raise SystemExit(f"hierarchy title segment: expected 1 match, found {test_text.count(old_segment)}")
test_text = test_text.replace(old_segment, new_segment, 1)
old_tail = '''  await nav.getByRole('button', { name: 'Thêm tờ vào ĐTĐ type 2' }).click();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
'''
new_tail = '''  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');
'''
if test_text.count(old_tail) != 1:
    raise SystemExit(f"hierarchy sheet tail: expected 1 match, found {test_text.count(old_tail)}")
test_path.write_text(test_text.replace(old_tail, new_tail, 1))

wave4_path = Path("tests-unit/wave4.test.ts")
wave4 = wave4_path.read_text()
wave4 += r'''

test("P0 Page rename preserves Sheet drafts and keeps title out of SheetContent", async () => {
  const dbName = `mednote-p0-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    store.patchActiveSheetContent({ body: "Draft trước khi đổi tên" });
    await store.renamePage("page-a", "Điều trị cập nhật");

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.structure?.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");
    assert.equal(snapshot.activeSheetContent?.body, "Draft trước khi đổi tên");
    assert.equal((await repository.loadSheetContent("sheet-a1"))?.body, "Draft trước khi đổi tên");

    await store.openSheet("sheet-a2");
    assert.equal(store.getSnapshot().structure?.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");

    const stored = await repository.loadLibrary();
    assert.equal(stored?.notes.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");
    for (const content of Object.values(stored?.sheetContents || {})) {
      assert.equal("title" in content, false);
      assert.equal("titleHtml" in content, false);
      assert.equal("logicalPageTitle" in content, false);
    }
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("P0 canvas and First Aid use Page.title metadata ownership", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/page-title-editor.tsx", import.meta.url), "utf8");
  assert.match(page, /type NotePageContentPatch = Partial<Omit<NotePage, "id" \| "title" \| "titleHtml" \| "__mednoteLazyPage">>/);
  assert.match(page, /<PageTitleEditor/);
  assert.doesNotMatch(page, /activeNote\.titleHtml/);
  assert.doesNotMatch(page, /page\.titleHtml \?/);
  assert.doesNotMatch(page, /titleHtml: pageTitle/);
  assert.match(page, /noteStore\.renamePage\(activeLogicalPage\.id, "TÊN CHỦ ĐỀ"\)/);
  assert.match(editor, /PAGE_TITLE_DEBOUNCE_MS = 280/);
  assert.match(editor, /noteStore\.renamePage\(targetPageId, nextTitle\)/);
});
'''
wave4_path.write_text(wave4)

remaining = [needle for needle in [
    "activeNote.titleHtml",
    "titleHtml: pageTitle",
    "page.titleHtml ?",
    "updateActiveNote({ title",
] if needle in page]
if remaining:
    raise SystemExit(f"P0 ownership leftovers: {remaining}")
