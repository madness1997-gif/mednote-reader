import { prepareRelationLibraryBeforeApp } from "./independent-library-core";

try {
  prepareRelationLibraryBeforeApp();
} catch {
  // Keep the last readable app state if migration data is malformed.
}

export {};
