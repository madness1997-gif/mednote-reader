import { NOTE_SHEET_LINK_HINT, noteSheetHref, parseNoteSheetHref } from "./note-sheet-link";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export function plainTextToRichHtml(value: string) {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

export function sanitizeRichTextHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["A", "DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT", "SUB", "SUP", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD"]);
  const allowedStyles = ["fontFamily", "fontSize", "color", "backgroundColor", "fontWeight", "fontStyle", "textDecoration", "textAlign", "lineHeight", "listStyleType", "borderCollapse", "borderColor", "borderStyle", "borderWidth", "borderTop", "borderBottom", "width", "minWidth", "padding", "margin", "display", "alignItems", "gridTemplateColumns", "columnGap", "rowGap", "verticalAlign", "whiteSpace"] as const;
  Array.from(template.content.querySelectorAll<HTMLElement>("*")).forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(element.tagName)) {
        element.remove();
        return;
      }
      const parent = element.parentNode;
      while (parent && element.firstChild) parent.insertBefore(element.firstChild, element);
      element.remove();
      return;
    }
    const linkedSheetId = element.tagName === "A" ? parseNoteSheetHref(element.getAttribute("href")) : null;
    if (element.tagName === "A" && !linkedSheetId) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    const styles = Object.fromEntries(allowedStyles.map((property) => [property, element.style[property]]));
    const face = element.tagName === "FONT" ? element.getAttribute("face") : null;
    const color = element.tagName === "FONT" ? element.getAttribute("color") : null;
    const size = element.tagName === "FONT" ? element.getAttribute("size") : null;
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
    allowedStyles.forEach((property) => {
      const styleValue = styles[property];
      if (styleValue) element.style[property] = styleValue;
    });
    if (linkedSheetId) {
      element.setAttribute("href", noteSheetHref(linkedSheetId));
      element.setAttribute("title", NOTE_SHEET_LINK_HINT);
    }
    if (face) element.setAttribute("face", face);
    if (color) element.setAttribute("color", color);
    if (size && /^[1-7]$/.test(size)) element.setAttribute("size", size);
  });
  return template.innerHTML;
}
