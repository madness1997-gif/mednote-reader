import { localBinaryStorage } from "./local-binary-storage";

const ASSET_DB = "mednote-first-aid-assets";
const ASSET_STORE = "assets";

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

export async function compressFirstAidImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? file), "image/webp", 0.84));
    return { blob, aspectRatio: canvas.width / Math.max(1, canvas.height) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
