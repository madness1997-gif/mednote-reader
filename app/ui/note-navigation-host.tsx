// @ts-nocheck
import type React from "react";
type TextLineHeight = any; type PaperTemplate = any; type PdfFitMode = any; type PdfViewMode = any; type PdfTool = any;

export type P9UiScope = Record<string, any>;

export function NoteNavigationHost({ scope }: { scope: P9UiScope }) {
  const { NoteSidebar, setNoteSidebarVisibility } = scope;
  return (<><aside className="note-navigation-host" aria-label="Điều hướng ghi chú"><NoteSidebar onRequestClose={() => setNoteSidebarVisibility(false)} /></aside></>);
}
