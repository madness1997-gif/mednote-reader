type TextDialogOptions = {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type SelectDialogOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectDialogOptions = {
  title: string;
  label?: string;
  value?: string;
  options: SelectDialogOption[];
  confirmLabel?: string;
};

export type NoteDestinationNotebook = {
  id: string;
  title: string;
  sections: Array<{ id: string; title: string }>;
};

export type NoteDestination =
  | { mode: "none" }
  | { mode: "notebook"; title: string }
  | { mode: "section"; notebookId: string; title: string }
  | { mode: "page"; notebookId: string; sectionId: string; title: string };

const STYLE_ID = "mednote-native-dialog-style";

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mednote-native-dialog-backdrop{position:fixed;inset:0;z-index:200000;display:grid;place-items:center;padding:18px;background:#10242d73;backdrop-filter:blur(2px)}
.mednote-native-dialog{width:min(440px,100%);overflow:hidden;border:1px solid #d5dfe2;border-radius:15px;background:#fff;color:#263b43;box-shadow:0 24px 80px #10242d55;font-family:Segoe UI,Arial,sans-serif}
.mednote-native-dialog header{padding:17px 18px 13px;border-bottom:1px solid #e3e9eb}.mednote-native-dialog header strong{font-size:16px}
.mednote-native-dialog form{display:grid;gap:14px;padding:16px 18px 18px}.mednote-native-dialog label{display:grid;gap:7px;color:#526a72;font-size:12px}
.mednote-native-dialog input,.mednote-native-dialog select{width:100%;height:40px;box-sizing:border-box;padding:0 11px;border:1px solid #bfcdd1;border-radius:9px;background:#fff;color:#263b43;font:14px Segoe UI,Arial,sans-serif;outline:none}
.mednote-native-dialog input:focus,.mednote-native-dialog select:focus{border-color:#287c8b;box-shadow:0 0 0 3px #287c8b1f}
.mednote-native-dialog-actions{display:flex;justify-content:flex-end;gap:9px}.mednote-native-dialog button{min-height:38px;padding:8px 14px;border:1px solid #c8d4d7;border-radius:9px;background:#fff;color:#38535c;font:600 13px Segoe UI,Arial,sans-serif;cursor:pointer}
.mednote-native-dialog button:hover{background:#f0f5f6}.mednote-native-dialog button.primary{border-color:#1d7181;background:#1d7181;color:#fff}.mednote-native-dialog button.primary:hover{background:#175f6d}
.mednote-note-destination{width:min(580px,100%)}.mednote-note-destination form{gap:12px}.mednote-note-destination-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mednote-note-destination-modes label{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #d5dfe2;border-radius:10px;cursor:pointer}.mednote-note-destination-modes label:has(input:checked){border-color:#287c8b;background:#f0f8f9}.mednote-note-destination-modes input{flex:0 0 auto;width:16px;height:16px;margin-top:2px}.mednote-note-destination-modes b,.mednote-note-destination-modes small{display:block}.mednote-note-destination-modes small{margin-top:3px;color:#71858c;font-size:10px}.mednote-note-destination-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mednote-note-destination-hint{margin:0;padding:9px 10px;border-radius:9px;background:#f3f7f8;color:#60767d;font-size:11px;line-height:1.45}@media(max-width:620px){.mednote-note-destination-modes,.mednote-note-destination-fields{grid-template-columns:1fr}}
`;
  document.head.append(style);
}

function createShell(title: string) {
  injectStyle();
  document.querySelector<HTMLElement>(".mednote-native-dialog-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "mednote-native-dialog-backdrop";
  backdrop.dataset.mednoteDialog = "1";
  backdrop.innerHTML = `<section class="mednote-native-dialog" role="dialog" aria-modal="true" aria-labelledby="mednote-native-dialog-title"><header><strong id="mednote-native-dialog-title"></strong></header></section>`;
  backdrop.querySelector("strong")!.textContent = title;
  document.body.append(backdrop);
  return { backdrop, dialog: backdrop.querySelector<HTMLElement>(".mednote-native-dialog")! };
}

export function requestText(options: TextDialogOptions): Promise<string | null> {
  const { backdrop, dialog } = createShell(options.title);
  const form = document.createElement("form");
  form.innerHTML = `<label><span></span><input type="text" autocomplete="off"><small class="mednote-native-dialog-error" hidden>Tên không được để trống.</small></label><div class="mednote-native-dialog-actions"><button type="button" data-cancel>Hủy</button><button type="submit" class="primary"></button></div>`;
  form.querySelector("label > span")!.textContent = options.label || "Tên";
  const input = form.querySelector<HTMLInputElement>("input")!;
  input.value = options.value || "";
  input.placeholder = options.placeholder || "";
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = options.confirmLabel || "Lưu";
  dialog.append(form);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
      resolve(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) finish(null);
    });
    form.querySelector<HTMLButtonElement>("[data-cancel]")!.addEventListener("click", () => finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        form.querySelector<HTMLElement>(".mednote-native-dialog-error")!.hidden = false;
        input.focus();
        return;
      }
      finish(value);
    });
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

export function requestSelect(options: SelectDialogOptions): Promise<string | null> {
  if (!options.options.length) return Promise.resolve(null);
  const { backdrop, dialog } = createShell(options.title);
  const form = document.createElement("form");
  form.innerHTML = `<label><span></span><select></select></label><div class="mednote-native-dialog-actions"><button type="button" data-cancel>Hủy</button><button type="submit" class="primary"></button></div>`;
  form.querySelector("label > span")!.textContent = options.label || "Chọn";
  const select = form.querySelector<HTMLSelectElement>("select")!;
  for (const option of options.options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.description ? `${option.label} — ${option.description}` : option.label;
    element.selected = option.value === options.value;
    select.append(element);
  }
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = options.confirmLabel || "Chọn";
  dialog.append(form);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
      resolve(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) finish(null);
    });
    form.querySelector<HTMLButtonElement>("[data-cancel]")!.addEventListener("click", () => finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(select.value || null);
    });
    requestAnimationFrame(() => select.focus());
  });
}

export function requestNoteDestination(options: {
  documentLabel: string;
  savedToLibrary: boolean;
  notebooks: NoteDestinationNotebook[];
}): Promise<NoteDestination | null> {
  const { backdrop, dialog } = createShell("Tạo note cho tài liệu?");
  dialog.classList.add("mednote-note-destination");
  const canUseExisting = options.notebooks.length > 0;
  const form = document.createElement("form");
  form.innerHTML = `
    <p class="mednote-note-destination-hint">PDF sẽ ${options.savedToLibrary ? "được lưu trong thư viện" : "chỉ mở tạm, không chiếm bộ nhớ lâu dài"}. Note luôn được lưu độc lập.</p>
    <div class="mednote-note-destination-modes">
      <label><input type="radio" name="mode" value="none" checked><span><b>Chỉ mở tài liệu</b><small>Không tạo note lúc này</small></span></label>
      <label><input type="radio" name="mode" value="notebook"><span><b>Notebook mới</b><small>Tạo một sổ note riêng</small></span></label>
      <label><input type="radio" name="mode" value="section" ${canUseExisting ? "" : "disabled"}><span><b>Section mới</b><small>Trong Notebook có sẵn</small></span></label>
      <label><input type="radio" name="mode" value="page" ${canUseExisting ? "" : "disabled"}><span><b>Page mới</b><small>Trong Section có sẵn</small></span></label>
    </div>
    <div class="mednote-note-destination-fields" hidden>
      <label data-field="notebook"><span>Notebook</span><select data-notebook></select></label>
      <label data-field="section"><span>Section</span><select data-section></select></label>
      <label data-field="title"><span data-title-label>Tên</span><input data-title type="text" autocomplete="off"></label>
    </div>
    <div class="mednote-native-dialog-actions"><button type="button" data-cancel>Hủy</button><button type="submit" class="primary">Tiếp tục</button></div>`;
  dialog.append(form);
  const fields = form.querySelector<HTMLElement>(".mednote-note-destination-fields")!;
  const notebookField = form.querySelector<HTMLElement>('[data-field="notebook"]')!;
  const sectionField = form.querySelector<HTMLElement>('[data-field="section"]')!;
  const titleField = form.querySelector<HTMLElement>('[data-field="title"]')!;
  const notebookSelect = form.querySelector<HTMLSelectElement>("[data-notebook]")!;
  const sectionSelect = form.querySelector<HTMLSelectElement>("[data-section]")!;
  const titleInput = form.querySelector<HTMLInputElement>("[data-title]")!;
  const titleLabel = form.querySelector<HTMLElement>("[data-title-label]")!;

  for (const notebook of options.notebooks) {
    const element = document.createElement("option");
    element.value = notebook.id;
    element.textContent = notebook.title;
    notebookSelect.append(element);
  }
  const renderSections = () => {
    sectionSelect.replaceChildren();
    const notebook = options.notebooks.find((item) => item.id === notebookSelect.value) || options.notebooks[0];
    for (const section of notebook?.sections || []) {
      const element = document.createElement("option");
      element.value = section.id;
      element.textContent = section.title;
      sectionSelect.append(element);
    }
  };
  const selectedMode = () => form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value || "none";
  const renderMode = () => {
    const mode = selectedMode();
    fields.hidden = mode === "none";
    notebookField.hidden = mode === "notebook";
    sectionField.hidden = mode !== "page";
    titleField.hidden = mode === "none";
    titleLabel.textContent = mode === "notebook" ? "Tên Notebook" : mode === "section" ? "Tên Section" : "Tên Page";
    titleInput.value = mode === "notebook"
      ? `Ghi chú — ${options.documentLabel}`
      : mode === "section"
        ? options.documentLabel
        : options.documentLabel;
    renderSections();
  };
  form.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((radio) => radio.addEventListener("change", renderMode));
  notebookSelect.addEventListener("change", renderSections);
  renderMode();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: NoteDestination | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
      resolve(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) finish(null);
    });
    form.querySelector<HTMLButtonElement>("[data-cancel]")!.addEventListener("click", () => finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const mode = selectedMode();
      if (mode === "none") return finish({ mode: "none" });
      const title = titleInput.value.trim();
      if (!title) return titleInput.focus();
      if (mode === "notebook") return finish({ mode, title });
      const notebookId = notebookSelect.value;
      if (!notebookId) return finish(null);
      if (mode === "section") return finish({ mode, notebookId, title });
      const sectionId = sectionSelect.value;
      if (!sectionId) return finish(null);
      finish({ mode: "page", notebookId, sectionId, title });
    });
    requestAnimationFrame(() => form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.focus());
  });
}
