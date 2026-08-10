import type {
  DocumentContext,
  DocumentGraph,
  DocumentGroup,
  DocumentLinkRelation,
  DocumentRecord,
  NoteDocumentLink,
} from "./document-domain";

export type SaveDocumentWorkspaceInput = {
  documents: DocumentRecord[];
  context: DocumentContext;
  group?: DocumentGroup;
  links?: NoteDocumentLink[];
  linkRelations?: DocumentLinkRelation[];
};

/** Document persistence stays outside Notebook → Section → Page → Sheet. */
export interface DocumentRepository {
  loadDocumentGraph(): Promise<DocumentGraph | null>;
  /** Atomically persists one reader context and every link created with it. */
  saveDocumentWorkspace(input: SaveDocumentWorkspaceInput): Promise<DocumentGraph>;
  /** Removes a reader context and its unreferenced documents without deleting notes. */
  deleteDocumentWorkspace(contextId: string): Promise<DocumentGraph>;
  /** Whole-graph boundary reserved for verified restore and metadata reconciliation. */
  replaceDocumentGraph(graph: DocumentGraph): Promise<void>;
}
