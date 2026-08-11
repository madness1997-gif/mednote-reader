import type React from "react";
export function SplitDivider({ onPointerDown }: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void }) { return <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={onPointerDown}><span>•••</span></div>; }
