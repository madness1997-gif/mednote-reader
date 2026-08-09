import type { DocumentGraph } from "./document-domain";

/**
 * Document persistence stays outside the Notebook → Section → Page → Sheet
 * hierarchy. Write commands are intentionally deferred to the PDF-linking wave;
 * Wave 1 only needs an independent read boundary and atomic migration storage.
 */
export interface DocumentRepository {
  loadDocumentGraph(): Promise<DocumentGraph | null>;
}
