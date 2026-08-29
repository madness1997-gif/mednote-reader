"use client";

import { createContext, useContext, type PropsWithChildren } from "react";
import type { DocumentWorkspaceController } from "./use-document-workspace-controller";
import type { NoteCanvasController } from "./use-note-canvas-controller";
import type { NoteEditorController } from "./use-note-editor-controller";
import type { ReaderInteractionController } from "./use-reader-interaction-controller";
import type { WorkspaceLayoutController } from "./use-workspace-layout-controller";

export type ReaderPaneControllers = {
  documents: DocumentWorkspaceController;
  layout: WorkspaceLayoutController;
  readerInteraction: ReaderInteractionController;
};

export type NotePaneControllers = {
  documents: DocumentWorkspaceController;
  layout: WorkspaceLayoutController;
  noteCanvas: NoteCanvasController;
  noteEditor: NoteEditorController;
};

const ReaderPaneControllersContext = createContext<ReaderPaneControllers | null>(null);
const NotePaneControllersContext = createContext<NotePaneControllers | null>(null);

export function ReaderPaneControllersProvider({ controllers, children }: PropsWithChildren<{ controllers: ReaderPaneControllers }>) {
  return <ReaderPaneControllersContext.Provider value={controllers}>{children}</ReaderPaneControllersContext.Provider>;
}

export function useReaderPaneControllers() {
  const controllers = useContext(ReaderPaneControllersContext);
  if (!controllers) throw new Error("ReaderPaneControllersProvider is missing");
  return controllers;
}

export function NotePaneControllersProvider({ controllers, children }: PropsWithChildren<{ controllers: NotePaneControllers }>) {
  return <NotePaneControllersContext.Provider value={controllers}>{children}</NotePaneControllersContext.Provider>;
}

export function useNotePaneControllers() {
  const controllers = useContext(NotePaneControllersContext);
  if (!controllers) throw new Error("NotePaneControllersProvider is missing");
  return controllers;
}
