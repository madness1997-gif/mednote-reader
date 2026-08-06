const RELATION_SELECTOR = ".rl-relations";
const CHIP_SELECTOR = ".rl-chip";

function compactRelationLabels(root: ParentNode) {
  const relationGroups = root.querySelectorAll<HTMLElement>(RELATION_SELECTOR);

  relationGroups.forEach((group) => {
    const visibleNames = new Set<string>();

    group.querySelectorAll<HTMLElement>(CHIP_SELECTOR).forEach((chip) => {
      if (chip.dataset.compactLabel !== "1") {
        const fullLabel = chip.textContent?.trim() || "";
        const path = fullLabel.replace(/^(?:Workspace|Nội dung)\s*:\s*/i, "");
        const name = path.split(/\s+\/\s+/).at(-1)?.trim() || path;

        chip.dataset.compactLabel = "1";
        chip.title = fullLabel;
        chip.textContent = name;
      }

      const key = (chip.textContent || "").trim().toLocaleLowerCase("vi");
      if (!key || visibleNames.has(key)) {
        chip.remove();
        return;
      }
      visibleNames.add(key);
    });
  });
}

compactRelationLabels(document);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      if (node.matches(RELATION_SELECTOR) || node.querySelector(RELATION_SELECTOR)) {
        compactRelationLabels(node);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

export {};
