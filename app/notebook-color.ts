export type NotebookIconStyle = {
  background: string;
  color: string;
  boxShadow: string;
};

/**
 * Stable visual identity for a Notebook.
 *
 * The color is derived only from the durable Notebook ID, so every surface
 * (Library, sidebar, future navigation views) renders the same Notebook with
 * the same color even after rename or reorder. FNV-1a feeds several HSL
 * dimensions so large libraries are not limited to a short repeating palette.
 */
export function notebookIconStyle(notebookId: string): NotebookIconStyle {
  let hash = 0x811c9dc5;
  for (let index = 0; index < notebookId.length; index += 1) {
    hash ^= notebookId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 56 + ((hash >>> 8) % 19);
  const foregroundLightness = 30 + ((hash >>> 16) % 13);
  const backgroundLightness = 92 + ((hash >>> 24) % 5);

  return {
    background: `hsl(${hue} ${Math.max(34, saturation - 16)}% ${backgroundLightness}%)`,
    color: `hsl(${hue} ${saturation}% ${foregroundLightness}%)`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} ${Math.max(28, saturation - 22)}% 84% / .72)`,
  };
}
