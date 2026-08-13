import { localBinaryStorage } from "./local-binary-storage";

const ASSET_DB = "mednote-first-aid-assets";
const ASSET_STORE = "assets";
const IMAGE_FILE_EXTENSION = /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;

function openAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) request.result.createObjectStore(ASSET_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLegacyAsset(id: string) {
  const database = await openAssetDb();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database.transaction(ASSET_STORE, "readonly").objectStore(ASSET_STORE).get(id);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function readFirstAidAsset(id: string) {
  const canonical = await localBinaryStorage.readAsset(id);
  if (canonical) return canonical;
  const legacy = await readLegacyAsset(id);
  if (legacy) await localBinaryStorage.saveAsset(id, legacy);
  return legacy;
}

export function isLikelyFirstAidImage(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION.test(file.name);
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn"));
      image.src = objectUrl;
      if (image.complete && image.naturalWidth > 0) resolve();
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Ảnh không có kích thước hợp lệ");
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressFirstAidImage(file: File) {
  if (!isLikelyFirstAidImage(file)) throw new Error("Tệp đã chọn không phải hình ảnh");

  try {
    const { image, width, height } = await loadImageElement(file);
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { blob: file, aspectRatio: width / Math.max(1, height) };
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? file), "image/webp", 0.84));
    return { blob, aspectRatio: canvas.width / Math.max(1, canvas.height) };
  } catch (error) {
    if (typeof createImageBitmap !== "function") throw error;
    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return { blob: file, aspectRatio: bitmap.width / Math.max(1, bitmap.height) };
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? file), "image/webp", 0.84));
      return { blob, aspectRatio: canvas.width / Math.max(1, canvas.height) };
    } finally {
      bitmap.close();
    }
  }
}
