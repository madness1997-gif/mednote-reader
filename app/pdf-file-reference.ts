export type PdfFileHandle = FileSystemFileHandle & {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};
export type PdfFileReference =
  | { kind: "desktop"; token: string }
  | { kind: "browser"; handle: PdfFileHandle }
  | { kind: "session" };

const selectedReferences = new WeakMap<Blob, PdfFileReference>();

export function pdfFileReference(blob: Blob) {
  return selectedReferences.get(blob);
}

export async function pickLinkedPdfFiles(multiple = true): Promise<File[] | null> {
  const desktop = window.mednoteDesktop;
  if (desktop?.pickPdfFiles && desktop.readLinkedPdf) {
    const selected = await desktop.pickPdfFiles(multiple);
    return Promise.all(selected.map(async (entry) => {
      const bytes = await desktop.readLinkedPdf!(entry.token);
      const file = new File([bytes], entry.name, { type: "application/pdf", lastModified: entry.lastModified });
      selectedReferences.set(file, { kind: "desktop", token: entry.token });
      return file;
    }));
  }
  const picker = (window as Window & { showOpenFilePicker?: (options: unknown) => Promise<PdfFileHandle[]> }).showOpenFilePicker;
  if (!picker) return null;
  const handles = await picker.call(window, {
    multiple, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
  });
  return Promise.all(handles.map(async (handle) => {
    const file = await handle.getFile();
    selectedReferences.set(file, { kind: "browser", handle });
    return file;
  }));
}

export async function readPdfReference(reference: PdfFileReference): Promise<Blob | undefined> {
  if (reference.kind === "desktop") {
    const read = typeof window === "undefined" ? undefined : window.mednoteDesktop?.readLinkedPdf;
    if (!read) return undefined;
    return new Blob([await read(reference.token)], { type: "application/pdf" });
  }
  if (reference.kind === "browser") return reference.handle.getFile();
  return undefined;
}
