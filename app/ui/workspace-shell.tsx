import type { CSSProperties, ReactNode, RefObject } from "react";

export type WorkspaceShellProps = {
  className: string;
  workspaceRef: RefObject<HTMLElement | null>;
  style: CSSProperties;
  pdfRail: ReactNode;
  reader: ReactNode;
  divider: ReactNode;
  note: ReactNode;
  noteNavigation: ReactNode;
  children?: ReactNode;
};

export function WorkspaceShell({ className, workspaceRef, style, pdfRail, reader, divider, note, noteNavigation, children }: WorkspaceShellProps) {
  return <section className={className} ref={workspaceRef} style={style}>{pdfRail}{reader}{divider}{note}{noteNavigation}{children}</section>;
}
