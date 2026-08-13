import type { BlockType } from "./first-aid-block-domain";

export type FirstAidImagePlacement = {
  x: number;
  y: number;
  width: number;
  maxHeight: number;
};

type LayoutRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function firstAidImagePlacement(blockType: BlockType | undefined, elementRect: LayoutRect, pageRect: LayoutRect): FirstAidImagePlacement {
  const pageWidth = Math.max(1, pageRect.width);
  const pageHeight = Math.max(1, pageRect.height);
  const zoneX = clamp((elementRect.left - pageRect.left) / pageWidth, 0, 1);
  const zoneWidth = Math.min(1 - zoneX, Math.max(.06, elementRect.width / pageWidth));
  const besideText = blockType === "figure-text";
  const preferredWidth = Math.min(besideText ? .28 : .46, zoneWidth * (besideText ? .68 : .48));
  const width = Math.min(zoneWidth, Math.max(besideText ? .12 : .16, preferredWidth));
  const x = clamp(zoneX + Math.max(0, zoneWidth - width) / 2, 0, 1 - width);
  const y = clamp((elementRect.top - pageRect.top) / pageHeight, .04, .94);
  return { x, y, width, maxHeight: besideText ? .22 : .3 };
}

export function fitFirstAidImageLayout(
  placement: FirstAidImagePlacement,
  aspectRatio: number,
  paperWidth: number,
  paperHeight: number,
) {
  const safeAspectRatio = Math.max(.01, aspectRatio);
  const paperRatio = Math.max(.01, paperWidth) / Math.max(.01, paperHeight);
  const preferredWidth = clamp(placement.width, .035, .9);
  const widthForMaxHeight = placement.maxHeight * safeAspectRatio / paperRatio;
  const width = Math.min(preferredWidth, Math.max(.035, widthForMaxHeight));
  const height = Math.min(.72, Math.max(.025, width * paperRatio / safeAspectRatio));
  const centerX = placement.x + preferredWidth / 2;
  return {
    x: clamp(centerX - width / 2, 0, 1 - width),
    y: clamp(placement.y, .04, 1 - height),
    width,
    height,
  };
}
