from pathlib import Path
import re

root = Path(".")


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return updated


# 1) Remove the React-owned native thumbnail sidebar. Keep only a neutral host
# for the Page -> Sheet navigator that already has the OneNote-style UI.
page_path = root / "app/page.tsx"
page = page_path.read_text(encoding="utf-8")
page = replace_once(
    page,
    r'\n\s*<aside className="note-thumbnails" aria-label="Trang ghi chú">.*?\n\s*</aside>',
    '\n        <aside className="note-navigation-host" aria-label="Điều hướng ghi chú" />',
    "remove native note thumbnail aside",
    re.S,
)

# PDF export used to switch sheets by clicking thumbnail buttons. Expose a tiny
# page-id bridge so export can still change the active sheet without any
# thumbnail DOM or hidden thumbnail implementation.
active_pattern = re.compile(
    r'(\n\s{2}const setActiveNoteId = \(pageId: string\) => \{\n'
    r'\s{4}updateActiveNotebook\(\(notebook\) => \(\{ \.\.\.notebook, activePageId: pageId \}\)\);\n'
    r'\s{2}\};\n)'
)


def add_activation_bridge(match: re.Match[str]) -> str:
    return match.group(1) + (
        '\n'
        '  useEffect(() => {\n'
        '    const activateNotePage = (event: Event) => {\n'
        '      const pageId = (event as CustomEvent<string>).detail;\n'
        '      if (!pageId || !activeNotebook.pages.some((item) => item.id === pageId)) return;\n'
        '      setActiveNoteId(pageId);\n'
        '    };\n'
        '    window.addEventListener("mednote:activate-note-page", activateNotePage);\n'
        '    return () => window.removeEventListener("mednote:activate-note-page", activateNotePage);\n'
        '  }, [activeNotebook.id, activeNotebook.pages]);\n'
    )


page, bridge_count = active_pattern.subn(add_activation_bridge, page, count=1)
if bridge_count != 1:
    raise SystemExit(f"add PDF-export activation bridge: expected 1 match, got {bridge_count}")

page = replace_once(
    page,
    r'<article className=\{`note-paper interactive ',
    '<article data-note-page-id={activeNote.id} className={`note-paper interactive ',
    "tag active note paper with page id",
)
page_path.write_text(page, encoding="utf-8")

# 2) The old host name itself said "thumbnails". Rename every remaining mount
# point reference to make the source model match the UI model.
for base in (root / "app", root / "src", root / "tests"):
    if not base.exists():
        continue
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx", ".css", ".cjs", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        updated = text.replace("note-thumbnails", "note-navigation-host")
        if updated != text:
            path.write_text(updated, encoding="utf-8")

# 3) Page->Sheet navigation is the only live note sidebar.
navigation_path = root / "app/page-sheet-navigation.ts"
navigation = navigation_path.read_text(encoding="utf-8")
navigation = navigation.replace(".onenote-note-navigation{display:none!important}\n", "")
navigation_path.write_text(navigation, encoding="utf-8")

clean_path = root / "app/page-sheet-sidebar-clean.ts"
clean = clean_path.read_text(encoding="utf-8")
clean = replace_once(
    clean,
    r'/\* The Page→Sheet navigator is the single source of truth\. Never stack the legacy navigator under it\. \*/\n'
    r'.*?'
    r'\.note-navigation-host:has\(> \.\$\{NAV_CLASS\}\) > \.\$\{NAV_CLASS\}\{display:grid!important;visibility:visible!important;opacity:1!important\}\n',
    '/* The OneNote-style Page→Sheet navigator is the single note navigation source. */\n'
    '.note-navigation-host:has(> .${NAV_CLASS}) > .${NAV_CLASS}{display:grid!important;visibility:visible!important;opacity:1!important}\n',
    "remove native/legacy sidebar fallback CSS",
    re.S,
)
clean_path.write_text(clean, encoding="utf-8")

# 4) PDF export no longer queries or clicks note-thumbnail DOM.
export_path = root / "app/note-pdf-export.tsx"
export = export_path.read_text(encoding="utf-8")
plan_prefix = (
    'function notePageIds() {\n'
    '  const context = currentContext();\n'
    '  if (context) return ((context.notebook.pages || []) as SheetPage[]).map((sheet) => String(sheet.id));\n'
    '  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper[data-note-page-id]");\n'
    '  return paper?.dataset.notePageId ? [paper.dataset.notePageId] : [];\n'
    '}\n\n'
    'function buildExportPlans(): ExportPlan[] {\n'
    '  const context = currentContext();\n'
    '  const availablePageIds = notePageIds();\n'
    '  if (!context) {\n'
    '    return availablePageIds.length ? [{\n'
    '      scope: "notebook",\n'
    '      title: "Notebook",\n'
    '      detail: `${availablePageIds.length} Sheet`,\n'
    '      fileName: "MedNote.pdf",\n'
    '      pageIndices: availablePageIds.map((_, index) => index),\n'
    '    }] : [];\n'
    '  }\n\n'
    '  const { notebook, record, activeSection, activeSheet } = context;'
)
export = replace_once(
    export,
    r'function buildExportPlans\(\): ExportPlan\[\] \{\n\s*const context = currentContext\(\);\n'
    r'.*?\n\s*const \{ notebook, record, activeSection, activeSheet \} = context;',
    plan_prefix,
    "replace thumbnail-dependent export-plan fallback",
    re.S,
)

activate_impl = (
    'async function activateNotePage(index: number) {\n'
    '  const pageIds = notePageIds();\n'
    '  const pageId = pageIds[index];\n'
    '  if (!pageId) throw new Error(`Không tìm thấy Sheet ${index + 1}`);\n\n'
    '  let paper = document.querySelector<HTMLElement>(".note-stage .note-paper");\n'
    '  if (paper?.dataset.notePageId !== pageId) {\n'
    '    window.dispatchEvent(new CustomEvent("mednote:activate-note-page", { detail: pageId }));\n'
    '  }\n\n'
    '  for (let attempt = 0; attempt < 45; attempt += 1) {\n'
    '    paper = document.querySelector<HTMLElement>(".note-stage .note-paper");\n'
    '    if (paper?.dataset.notePageId === pageId) break;\n'
    '    await nextFrame();\n'
    '    if (attempt === 44) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);\n'
    '  }\n\n'
    '  await settleLayout();\n'
    '  paper = document.querySelector<HTMLElement>(".note-stage .note-paper");\n'
    '  if (!paper) throw new Error("Không tìm thấy Sheet để xuất");\n'
    '  return paper;\n'
    '}\n\n'
    'async function exportPlanToPdfBytes'
)
export = replace_once(
    export,
    r'async function activateNotePage\(index: number\) \{.*?\n\}\n\nasync function exportPlanToPdfBytes',
    activate_impl,
    "replace thumbnail-click page activation",
    re.S,
)

export_prelude = (
    'async function exportPlanToPdfBytes(plan: ExportPlan, onProgress: (progress: ExportProgress) => void) {\n'
    '  const pageIds = notePageIds();\n'
    '  if (!pageIds.length) throw new Error("Notebook chưa có Sheet nào");\n'
    '  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);\n\n'
    '  const currentPaper = document.querySelector<HTMLElement>(".note-stage .note-paper");\n'
    '  const originalIndex = Math.max(0, pageIds.indexOf(currentPaper?.dataset.notePageId || pageIds[0]));\n'
    '  const pdf = await createPdfDocument();'
)
export = replace_once(
    export,
    r'async function exportPlanToPdfBytes\(plan: ExportPlan, onProgress: \(progress: ExportProgress\) => void\) \{\n'
    r'.*?\n\s*const pdf = await createPdfDocument\(\);',
    export_prelude,
    "replace export thumbnail prelude",
    re.S,
)
export_path.write_text(export, encoding="utf-8")

export_css_path = root / "app/note-pdf-export.css"
export_css = export_css_path.read_text(encoding="utf-8")
export_css = export_css.replace(".note-pdf-export-active .note-thumb,\n", "")
export_css_path.write_text(export_css, encoding="utf-8")

# The dedicated export harness must also be thumbnail-free.
harness_path = root / "app/pdf-export-e2e-harness.tsx"
harness = harness_path.read_text(encoding="utf-8")
harness = re.sub(
    r'\n\s*<div className="note-navigation-host" style=\{\{ marginTop: 12 \}\}>.*?</div>\n',
    "\n",
    harness,
    count=1,
    flags=re.S,
)
harness = harness.replace(
    'className="note-paper"',
    'className="note-paper" data-note-page-id="e2e-sheet-1"',
    1,
)
harness_path.write_text(harness, encoding="utf-8")

# 5) Remove native Note-thumbnail CSS while keeping PDF thumbnails unchanged.
globals_path = root / "app/globals.css"
css = globals_path.read_text(encoding="utf-8")
css = css.replace(
    ".brand-group, .top-actions, .document-title, .pane-toolbar, .note-toolbar, .notes-heading, .rail-heading",
    ".brand-group, .top-actions, .document-title, .pane-toolbar, .note-toolbar, .rail-heading",
)
css = css.replace(".pdf-thumb, .note-thumb", ".pdf-thumb")
css = css.replace(".pdf-thumb.active, .note-thumb.active", ".pdf-thumb.active")
css = css.replace(".mini-paper, .mini-note", ".mini-paper")
css = css.replace(".mini-paper i, .mini-note i", ".mini-paper i")
css = "\n".join(
    line for line in css.splitlines()
    if not any(term in line for term in ("notes-heading", "note-thumb", "mini-note", "new-page"))
) + "\n"
globals_path.write_text(css, encoding="utf-8")

# 6) Strengthen sidebar E2E: exactly one Page->Sheet navigator must occupy the host.
test_path = root / "tests/sidebar-controls.spec.cjs"
if test_path.exists():
    test = test_path.read_text(encoding="utf-8")
    test = test.replace(
        "  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });",
        "  await expect(page.locator('.note-navigation-host > .mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });\n"
        "  await expect(page.locator('.note-navigation-host > :not(.mednote-page-sheet-nav)')).toHaveCount(0);",
    )
    test = test.replace(
        "const hiddenState = await page.evaluate(() => localStorage.getItem('mednote-note-navigation-hidden'));",
        "const hiddenState = await page.evaluate(() => sessionStorage.getItem('mednote-note-navigation-hidden'));",
    )
    test_path.write_text(test, encoding="utf-8")

# 7) Source-level proof: no Note-thumbnail implementation remains anywhere that ships/tests.
forbidden = (
    "note-thumbnails",
    "note-thumb",
    "mini-note",
    "notes-heading",
    "VirtualNoteThumbnailList",
    "relation-note-hide-native-thumbnails",
)
offenders: list[str] = []
scan_roots = [root / "app", root / "src", root / "tests", root / "vite.thumbnail-virtualization.ts"]
for base in scan_roots:
    paths = [base] if base.is_file() else list(base.rglob("*")) if base.exists() else []
    for path in paths:
        if not path.is_file() or path.suffix not in {".ts", ".tsx", ".css", ".cjs", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        for term in forbidden:
            if term in text:
                offenders.append(f"{path}: {term}")
if offenders:
    raise SystemExit("Native note-thumbnail source still exists:\n" + "\n".join(offenders))

required = {
    "neutral navigation host": 'className="note-navigation-host"' in page_path.read_text(encoding="utf-8"),
    "Page->Sheet mount target": 'document.querySelector<HTMLElement>(".note-navigation-host")' in navigation_path.read_text(encoding="utf-8"),
    "OneNote-style nav class": "mednote-page-sheet-nav" in (root / "app/page-sheet-state.ts").read_text(encoding="utf-8"),
    "PDF export page bridge": "mednote:activate-note-page" in page_path.read_text(encoding="utf-8"),
    "PDF exporter page bridge": "mednote:activate-note-page" in export_path.read_text(encoding="utf-8"),
}
missing = [name for name, ok in required.items() if not ok]
if missing:
    raise SystemExit("Required OneNote-sidebar invariant missing: " + ", ".join(missing))

print("Note thumbnail source removed; OneNote Page->Sheet sidebar is the sole note navigator.")
