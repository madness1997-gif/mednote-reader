export type NotebookColorTokens = {
  background: string;
  foreground: string;
  border: string;
};

/**
 * Stable visual identity for a Notebook.
 *
 * This is deliberately framework-agnostic: it returns semantic color tokens,
 * not React/CSS style properties. The color is derived only from the durable
 * Notebook ID, so every surface can render the same Notebook consistently
 * after rename/reorder without persisting presentation state.
 */
export function notebookColorTokens(notebookId: string): NotebookColorTokens {
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
    foreground: `hsl(${hue} ${saturation}% ${foregroundLightness}%)`,
    border: `hsl(${hue} ${Math.max(28, saturation - 22)}% 84% / .72)`,
  };
}
