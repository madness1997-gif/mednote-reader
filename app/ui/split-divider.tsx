import type { WorkspaceLayoutController } from "../use-workspace-layout-controller";

export function SplitDivider({ layout }: { layout: WorkspaceLayoutController }) {
  return <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={layout.startDividerResize}><span>•••</span></div>;
}
