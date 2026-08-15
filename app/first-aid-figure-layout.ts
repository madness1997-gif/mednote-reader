export const DEFAULT_FIRST_AID_IMAGE_WIDTH_RATIO = .4;
export const MIN_FIRST_AID_IMAGE_WIDTH_RATIO = .18;
export const MAX_FIRST_AID_IMAGE_WIDTH_RATIO = .75;

export function normalizeFirstAidImageWidthRatio(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FIRST_AID_IMAGE_WIDTH_RATIO;
  return Math.max(MIN_FIRST_AID_IMAGE_WIDTH_RATIO, Math.min(MAX_FIRST_AID_IMAGE_WIDTH_RATIO, numeric));
}

export function resizeFirstAidImageWidthRatio(initial: unknown, deltaPixels: number, containerWidth: number, imageSide: "left" | "right" = "left") {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return normalizeFirstAidImageWidthRatio(initial);
  const direction = imageSide === "right" ? -1 : 1;
  return normalizeFirstAidImageWidthRatio(normalizeFirstAidImageWidthRatio(initial) + direction * deltaPixels / containerWidth);
}
