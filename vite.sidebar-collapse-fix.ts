import type { Plugin } from "vite";

const CLOSE_GUARD = '    if (performance.now() < suppressCloseUntil) return;';
const CLOSE_GUARD_REPLACEMENT = `    // Close must always respond to an explicit click/tap. The old 900 ms guard
    // could swallow the user's first attempt to hide the sidebar after entering Note.`;

export function sidebarCollapseFixPlugin(): Plugin {
  return {
    name: "mednote-sidebar-collapse-fix",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/relation-navigation-collapse.ts")) return null;
      if (!code.includes(CLOSE_GUARD)) {
        throw new Error("Không tìm thấy close guard của sidebar note để sửa.");
      }
      return { code: code.replace(CLOSE_GUARD, CLOSE_GUARD_REPLACEMENT), map: null };
    },
  };
}
