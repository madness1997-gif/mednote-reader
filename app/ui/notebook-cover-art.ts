/** Bundled assets use Vite URLs on both GitHub Pages and the packaged desktop app.
 * Persist only the template ID in notebook records; artwork is shared by every notebook.
 */
export const COVER_ART: Partial<Record<string, { full: string; thumbnail: string }>> = {
  strawberry: { full: new URL('../assets/covers/strawberry.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/strawberry-thumb.webp', import.meta.url).href },
  citrus: { full: new URL('../assets/covers/citrus.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/citrus-thumb.webp', import.meta.url).href },
  fruit: { full: new URL('../assets/covers/fruit.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/fruit-thumb.webp', import.meta.url).href },
  meadow: { full: new URL('../assets/covers/meadow.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/meadow-thumb.webp', import.meta.url).href },
  nocturne: { full: new URL('../assets/covers/nocturne.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/nocturne-thumb.webp', import.meta.url).href },
  waves: { full: new URL('../assets/covers/waves.webp', import.meta.url).href, thumbnail: new URL('../assets/covers/waves-thumb.webp', import.meta.url).href },
};
