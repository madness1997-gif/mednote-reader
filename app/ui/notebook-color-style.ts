import type { CSSProperties } from "react";
import { notebookColorTokens } from "../notebook-color";

/** UI adapter for the framework-agnostic Notebook color identity. */
export function notebookIconStyle(notebookId: string): CSSProperties {
  const tokens = notebookColorTokens(notebookId);
  return {
    background: tokens.background,
    color: tokens.foreground,
    boxShadow: `inset 0 0 0 1px ${tokens.border}`,
  };
}
