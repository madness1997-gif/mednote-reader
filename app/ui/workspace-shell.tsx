import type { ReactNode } from "react";
import type { WorkspaceLayoutController } from "../use-workspace-layout-controller";
import type { PdfRailTab } from "./ui-contracts";

export type WorkspaceShellProps = {
  layout: WorkspaceLayoutController;
  pdfRailVisible: boolean;
  pdfRailTab: PdfRailTab;
  pdfRail: ReactNode;
  reader: ReactNode;
  divider: ReactNode;
  note: ReactNode;
  noteNavigation: ReactNode;
  children?: ReactNode;
};

export function WorkspaceShell({ layout, pdfRailVisible, pdfRailTab, pdfRail, reader, divider, note, noteNavigation, children }: WorkspaceShellProps) {
  return <section className={layout.getWorkspaceClassName(pdfRailVisible, pdfRailTab)} ref={layout.workspaceRef} style={layout.workspaceStyle}>{pdfRail}{reader}{divider}{note}{noteNavigation}{children}</section>;
}
