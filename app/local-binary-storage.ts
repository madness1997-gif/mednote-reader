const DB_NAME = "mednote-local";
const DB_VERSION = 1;
const DB_STORE = "documents";

export type StoredPdf = {
  blob: Blob;
  name: string;
};

type StoredAsset = {
  blob: Blob;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>) {
  const database = await openDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

function readRecord<T>(database: IDBDatabase, key: string) {
  return new Promise<T | undefined>((resolve, reject) => {
    const request = database.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(database: IDBDatabase, key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteRecord(database: IDBDatabase, key: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function savePdf(documentId: string, name: string, blob: Blob) {
  await withDatabase((database) => writeRecord(database, `pdf:${documentId}`, { blob, name } satisfies StoredPdf));
}

async function readPdf(documentId: string) {
  return withDatabase((database) => readRecord<StoredPdf>(database, `pdf:${documentId}`));
}

async function deletePdf(documentId: string) {
  await withDatabase((database) => deleteRecord(database, `pdf:${documentId}`));
}

async function saveAsset(assetId: string, blob: Blob) {
  await withDatabase((database) => writeRecord(database, `asset:${assetId}`, { blob } satisfies StoredAsset));
}

async function readAsset(assetId: string) {
  const stored = await withDatabase((database) => readRecord<StoredAsset>(database, `asset:${assetId}`));
  return stored?.blob;
}

async function deleteAsset(assetId: string) {
  await withDatabase((database) => deleteRecord(database, `asset:${assetId}`));
}

async function readLegacyCurrentPdf() {
  return withDatabase((database) => readRecord<StoredPdf>(database, "current-pdf"));
}

export const localBinaryStorage = {
  savePdf,
  readPdf,
  deletePdf,
  saveAsset,
  readAsset,
  deleteAsset,
  readLegacyCurrentPdf,
} as const;
