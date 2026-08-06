const STYLE_ID = "relation-note-hide-native-thumbnails-style";
const NAV_SELECTOR = ":scope > .onenote-note-navigation";
const LEGACY_SELECTORS = [
  ":scope > .notes-heading",
  ":scope > .note-thumb-wrap",
  ":scope > .new-page",
  ".note-thumb",
  ".mini-note",
  ".note-thumb-delete",
];

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.note-thumbnails:has(> .onenote-note-navigation) > .notes-heading,
.note-thumbnails:has(> .onenote-note-navigation) > .note-thumb-wrap,
.note-thumbnails:has(> .onenote-note-navigation) > .new-page,
.note-thumbnails:has(> .onenote-note-navigation) .note-thumb,
.note-thumbnails:has(> .onenote-note-navigation) .mini-note,
.note-thumbnails:has(> .onenote-note-navigation) .note-thumb-delete {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
.note-thumbnails:has(> .onenote-note-navigation) > .onenote-note-navigation {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
}
`;
  document.head.append(style);
}

function hideNativeThumbnails() {
  injectStyle();
  for (const aside of Array.from(document.querySelectorAll<HTMLElement>(".note-thumbnails"))) {
    const navigation = aside.querySelector<HTMLElement>(NAV_SELECTOR);
    if (!navigation) continue;

    aside.classList.add("onenote-navigation-active");
    navigation.style.setProperty("display", "flex", "important");
    navigation.style.setProperty("visibility", "visible", "important");
    navigation.style.setProperty("opacity", "1", "important");

    for (const selector of LEGACY_SELECTORS) {
      for (const element of Array.from(aside.querySelectorAll<HTMLElement>(selector))) {
        if (element === navigation || navigation.contains(element)) continue;
        element.style.setProperty("display", "none", "important");
        element.style.setProperty("visibility", "hidden", "important");
        element.style.setProperty("pointer-events", "none", "important");
        element.setAttribute("aria-hidden", "true");
      }
    }
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    hideNativeThumbnails();
  });
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 700);

export {};
