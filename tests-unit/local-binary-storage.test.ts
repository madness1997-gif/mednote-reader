import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import "fake-indexeddb/auto";

import { localBinaryStorage } from "../app/local-binary-storage";

const DB_NAME = "mednote-local";
const DB_STORE = "documents";

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${DB_NAME} is blocked`));
  });
}

function writeRawRecord(key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

function readRawRecord<T>(key: string) {
  return new Promise<T | undefined>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const readRequest = database.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      readRequest.onsuccess = () => {
        database.close();
        resolve(readRequest.result as T | undefined);
      };
      readRequest.onerror = () => {
        database.close();
        reject(readRequest.error);
      };
    };
  });
}

beforeEach(deleteDatabase);
after(deleteDatabase);

test("save and read PDF preserve blob content, type and name", async () => {
  const blob = new Blob(["first PDF"], { type: "application/pdf" });
  await localBinaryStorage.savePdf("doc-1", "Harrison.pdf", blob);

  const stored = await localBinaryStorage.readPdf("doc-1");

  assert.equal(stored?.name, "Harrison.pdf");
  assert.equal(stored?.blob.type, "application/pdf");
  assert.equal(await stored?.blob.text(), "first PDF");
  const raw = await readRawRecord<{ blob: Blob; name: string }>("pdf:doc-1");
  assert.deepEqual(Object.keys(raw ?? {}).sort(), ["blob", "name"]);
  assert.equal(raw?.name, "Harrison.pdf");
  assert.equal(await raw?.blob.text(), "first PDF");
});

test("saving the same documentId overwrites the existing PDF record", async () => {
  await localBinaryStorage.savePdf("doc-1", "old.pdf", new Blob(["old"]));
  await localBinaryStorage.savePdf("doc-1", "new.pdf", new Blob(["new"]));

  const stored = await localBinaryStorage.readPdf("doc-1");

  assert.equal(stored?.name, "new.pdf");
  assert.equal(await stored?.blob.text(), "new");
});

test("deletePdf removes the PDF record", async () => {
  await localBinaryStorage.savePdf("doc-1", "delete.pdf", new Blob(["delete"]));
  await localBinaryStorage.deletePdf("doc-1");

  assert.equal(await localBinaryStorage.readPdf("doc-1"), undefined);
});

test("assets support save, read and delete", async () => {
  const blob = new Blob(["image bytes"], { type: "image/png" });
  await localBinaryStorage.saveAsset("image-1", blob);

  const stored = await localBinaryStorage.readAsset("image-1");
  assert.equal(stored?.type, "image/png");
  assert.equal(await stored?.text(), "image bytes");
  const raw = await readRawRecord<{ blob: Blob }>("asset:image-1");
  assert.deepEqual(Object.keys(raw ?? {}), ["blob"]);
  assert.equal(await raw?.blob.text(), "image bytes");

  await localBinaryStorage.deleteAsset("image-1");
  assert.equal(await localBinaryStorage.readAsset("image-1"), undefined);
});

test("PDF and asset with the same ID remain isolated by key prefix", async () => {
  await localBinaryStorage.savePdf("shared", "shared.pdf", new Blob(["pdf"]));
  await localBinaryStorage.saveAsset("shared", new Blob(["asset"]));

  assert.equal(await (await localBinaryStorage.readPdf("shared"))?.blob.text(), "pdf");
  assert.equal(await (await localBinaryStorage.readAsset("shared"))?.text(), "asset");
});

test("missing PDF and asset keys return undefined without throwing", async () => {
  assert.equal(await localBinaryStorage.readPdf("missing"), undefined);
  assert.equal(await localBinaryStorage.readAsset("missing"), undefined);
});

test("legacy current-pdf remains import-readable", async () => {
  await writeRawRecord("current-pdf", {
    blob: new Blob(["legacy PDF"], { type: "application/pdf" }),
    name: "legacy.pdf",
  });

  const stored = await localBinaryStorage.readLegacyCurrentPdf();

  assert.equal(stored?.name, "legacy.pdf");
  assert.equal(await stored?.blob.text(), "legacy PDF");
});
