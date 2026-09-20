import { pdfFileReference, readPdfReference, type PdfFileReference } from "./pdf-file-reference";

const DB_NAME = "mednote-local";
const DB_VERSION = 1;
const DB_STORE = "documents";

export type StoredPdf = {
  blob: Blob;
  name: string;
};

type LinkedPdf = { name: string; reference: PdfFileReference };
const sessionPdfs = new Map<string, Blob>();

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
  const reference = pdfFileReference(blob) ?? (typeof File !== "undefined" && blob instanceof File ? { kind: "session" as const } : undefined);
  const record: LinkedPdf | StoredPdf = reference ? { name, reference } : { name, blob };
  await withDatabase((database) => writeRecord(database, `pdf:${documentId}`, record));
  sessionPdfs.delete(documentId);
  if (reference?.kind === "session") sessionPdfs.set(documentId, blob);
}

async function readPdf(documentId: string, options: { forBackup?: boolean } = {}): Promise<StoredPdf | undefined> {
  const stored = await withDatabase((database) => readRecord<StoredPdf | LinkedPdf>(database, `pdf:${documentId}`));
  if (!stored) return undefined;
  if (!("reference" in stored)) return stored;
  if (options.forBackup) return undefined;
  try {
    const blob = stored.reference.kind === "session" ? sessionPdfs.get(documentId) : await readPdfReference(stored.reference);
    return blob ? { name: stored.name, blob } : undefined;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Cần cấp lại quyền truy cập PDF gốc. Hãy chọn lại file.");
    }
    return undefined;
  }
}

async function isLinkedPdf(documentId: string) {
  const stored = await withDatabase((database) => readRecord<StoredPdf | LinkedPdf>(database, `pdf:${documentId}`));
  return !!stored && "reference" in stored;
}

async function rememberMissingPdf(documentId: string, name: string) {
  const stored = await withDatabase((database) => readRecord<StoredPdf | LinkedPdf>(database, `pdf:${documentId}`));
  if (!stored) await withDatabase((database) => writeRecord(database, `pdf:${documentId}`, { name, reference: { kind: "session" } } satisfies LinkedPdf));
}

async function requestPdfAccess(documentId: string) {
  const stored = await withDatabase((database) => readRecord<StoredPdf | LinkedPdf>(database, `pdf:${documentId}`));
  if (stored && "reference" in stored && stored.reference.kind === "browser") {
    const handle = stored.reference.handle;
    if (await handle.queryPermission({ mode: "read" }) !== "granted") {
      await handle.requestPermission({ mode: "read" });
    }
  }
}

async function renamePdf(documentId: string, name: string) {
  const stored = await withDatabase((database) => readRecord<StoredPdf | LinkedPdf>(database, `pdf:${documentId}`));
  if (stored) await withDatabase((database) => writeRecord(database, `pdf:${documentId}`, { ...stored, name }));
}

async function deletePdf(documentId: string) {
  sessionPdfs.delete(documentId);
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
  renamePdf,
  isLinkedPdf,
  rememberMissingPdf,
  requestPdfAccess,
  readPdf,
  deletePdf,
  saveAsset,
  readAsset,
  deleteAsset,
  readLegacyCurrentPdf,
} as const;
