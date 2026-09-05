import { ordered, type NoteStructure } from "./note-domain";

const PREFIX = "#mednote-sheet=";
export const NOTE_SHEET_LINK_HINT = "Bấm để mở sheet · Ctrl+bấm (⌘+bấm trên Mac) khi đang sửa chữ";

export function noteSheetHref(sheetId: string) {
  return `${PREFIX}${encodeURIComponent(sheetId)}`;
}

export function parseNoteSheetHref(href: string | null): string | null {
  if (!href?.startsWith(PREFIX)) return null;
  try {
    const id = decodeURIComponent(href.slice(PREFIX.length));
    return id && !/[\u0000-\u001f\u007f]/.test(id) && noteSheetHref(id) === href ? id : null;
  } catch {
    return null;
  }
}

export type NoteSheetLinkTarget = { sheetId: string; label: string; path: string };

// Build from navigation metadata only; opening the picker never loads sheet bodies.
export function noteSheetLinkTargets(structure: NoteStructure): NoteSheetLinkTarget[] {
  const targets: NoteSheetLinkTarget[] = [];
  const groupBy = <T,>(items: T[], key: (item: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const group = groups.get(key(item)) ?? [];
      group.push(item);
      groups.set(key(item), group);
    }
    return groups;
  };
  const sections = groupBy(structure.sections, (section) => section.notebookId);
  const pages = groupBy(structure.pages, (page) => page.sectionId);
  const sheets = groupBy(structure.sheets, (sheet) => sheet.pageId);
  for (const notebook of ordered(structure.notebooks)) {
    for (const section of ordered(sections.get(notebook.id) ?? [])) {
      for (const page of ordered(pages.get(section.id) ?? [])) {
        ordered(sheets.get(page.id) ?? []).forEach((sheet, index) => {
          const label = `${page.title} · Tờ ${index + 1}`;
          targets.push({ sheetId: sheet.id, label, path: `${notebook.title} / ${section.title} / ${label}` });
        });
      }
    }
  }
  return targets;
}

export function normalizeNoteLinkSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase().trim();
}
