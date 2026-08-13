export type EditorMode = "edit" | "view";
export type BlockType = "heading" | "label" | "text" | "figure" | "figure-text" | "table" | "flow" | "pearl";
export type TextStyle = "paragraph" | "bullets" | "numbered";

export type FirstAidBlock = {
  id: string;
  type: BlockType;
  title?: string;
  titleHtml?: string;
  label?: string;
  labelHtml?: string;
  text?: string;
  textHtml?: string;
  textStyle?: TextStyle;
  imageAssetId?: string;
  imageObjectId?: string;
  imageName?: string;
  imageAspectRatio?: number;
  caption?: string;
  captionHtml?: string;
  imageSide?: "left" | "right";
  rows?: string[][];
  rowsHtml?: string[][];
  steps?: string[];
  stepsHtml?: string[];
};

export function uid(prefix = "fa-block") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createBlock(type: BlockType): FirstAidBlock {
  switch (type) {
    case "heading": return { id: uid(), type, title: "" };
    case "label": return { id: uid(), type, label: "", text: "" };
    case "text": return { id: uid(), type, text: "", textStyle: "paragraph" };
    case "figure": return { id: uid(), type, caption: "" };
    case "figure-text": return { id: uid(), type, text: "", caption: "", imageSide: "left" };
    case "table": return { id: uid(), type, rows: [["", ""], ["", ""]] };
    case "flow": return { id: uid(), type, label: "", steps: [""] };
    case "pearl": return { id: uid(), type, label: "", text: "" };
  }
}

export function lines(value = "") {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function blockPlainText(block: FirstAidBlock) {
  switch (block.type) {
    case "heading": return block.title ?? "";
    case "label": return `${block.label ?? ""}\n${block.text ?? ""}`.trim();
    case "text": return block.text ?? "";
    case "figure": return block.caption ?? "";
    case "figure-text": return `${block.text ?? ""}\n${block.caption ?? ""}`.trim();
    case "table": return (block.rows ?? []).map((row) => row.join(" | ")).join("\n");
    case "flow": return `${block.label ?? "CƠ CHẾ"}\n${(block.steps ?? []).join(" → ")}`.trim();
    case "pearl": return `${block.label ?? "HIGH-YIELD"}: ${block.text ?? ""}`;
  }
}
