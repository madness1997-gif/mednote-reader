import { requestSelect, requestText } from "./mednote-dialog";
import type { NoteStore } from "./note-store";
import type { NoteSidebarNotebook, NoteSidebarPage, NoteSidebarSection, NoteSidebarSheet } from "./note-sidebar-model";

export type NoteSidebarPrompts = {
  requestText: typeof requestText;
  requestSelect: typeof requestSelect;
  confirm: (message: string) => boolean;
  alert: (message: string) => void;
};

const browserPrompts: NoteSidebarPrompts = {
  requestText,
  requestSelect,
  confirm: (message) => window.confirm(message),
  alert: (message) => window.alert(message),
};

export class NoteSidebarController {
  private pending = false;

  constructor(
    private readonly store: NoteStore,
    private readonly prompts: NoteSidebarPrompts = browserPrompts,
  ) {}

  private async perform(operation: () => Promise<unknown>) {
    if (this.pending || this.store.getSnapshot().busy) return;
    this.pending = true;
    try {
      await operation();
    } finally {
      this.pending = false;
    }
  }

  openNotebook(id: string) { return this.perform(() => this.store.openNotebook(id)); }
  openSection(id: string) { return this.perform(() => this.store.openSection(id)); }
  openPage(id: string) { return this.perform(() => this.store.openPage(id)); }
  openSheet(id: string) { return this.perform(() => this.store.openSheet(id)); }

  createNotebook() {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Tạo Notebook", label: "Tên Notebook", value: "Notebook mới", confirmLabel: "Tạo" });
      if (title) await this.store.createNotebook(title);
    });
  }

  renameNotebook(notebook: NoteSidebarNotebook) {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Đổi tên Notebook", label: "Tên Notebook", value: notebook.title });
      if (title) await this.store.renameNotebook(notebook.id, title);
    });
  }

  deleteNotebook(notebook: NoteSidebarNotebook) {
    return this.perform(async () => {
      if (this.prompts.confirm(`Xóa Notebook “${notebook.title}”? PDF liên quan vẫn được giữ.`)) {
        await this.store.deleteNotebook(notebook.id);
      }
    });
  }

  createSection(notebook: NoteSidebarNotebook) {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Thêm Section", label: "Tên Section", value: "Section mới", confirmLabel: "Thêm" });
      if (!title) return;
      const section = await this.store.createSection(notebook.id, title);
      await this.store.createPage(section.id, "Page mới");
    });
  }

  renameSection(section: NoteSidebarSection) {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Đổi tên Section", label: "Tên Section", value: section.title });
      if (title) await this.store.renameSection(section.id, title);
    });
  }

  deleteSection(section: NoteSidebarSection, sectionCount: number) {
    return this.perform(async () => {
      if (sectionCount <= 1) return this.prompts.alert("Notebook phải còn ít nhất một Section.");
      if (this.prompts.confirm(`Xóa Section và ${section.pages.length} Page bên trong?`)) {
        await this.store.deleteSection(section.id);
      }
    });
  }

  createPage(section: NoteSidebarSection) {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Thêm Page", label: "Tên Page", value: "Page mới", confirmLabel: "Thêm" });
      if (title) await this.store.createPage(section.id, title);
    });
  }

  renamePage(page: NoteSidebarPage) {
    return this.perform(async () => {
      const title = await this.prompts.requestText({ title: "Đổi tên Page", label: "Tên Page", value: page.title });
      if (title) await this.store.renamePage(page.id, title);
    });
  }

  movePage(page: NoteSidebarPage, sections: readonly NoteSidebarSection[]) {
    return this.perform(async () => {
      const options = sections.filter((section) => section.id !== page.sectionId);
      if (!options.length) return this.prompts.alert("Notebook chưa có Section khác.");
      const sectionId = await this.prompts.requestSelect({
        title: "Chuyển Page",
        label: "Section đích",
        value: options[0].id,
        options: options.map((section) => ({ value: section.id, label: section.title })),
        confirmLabel: "Chuyển",
      });
      const target = options.find((section) => section.id === sectionId);
      if (target) await this.store.movePage(page.id, target.id, target.pages.length);
    });
  }

  deletePage(page: NoteSidebarPage) {
    return this.perform(async () => {
      if (this.prompts.confirm(`Xóa Page “${page.title}” và toàn bộ ${page.sheets.length} tờ bên trong?`)) {
        await this.store.deletePage(page.id);
      }
    });
  }

  createSheet(page: NoteSidebarPage) { return this.perform(() => this.store.createSheet(page.id)); }

  moveSheet(sheet: NoteSidebarSheet, nextOrder: number) {
    return this.perform(() => this.store.moveSheet(sheet.id, sheet.pageId, nextOrder));
  }

  deleteSheet(page: NoteSidebarPage, sheet: NoteSidebarSheet) {
    return this.perform(async () => {
      if (page.sheets.length === 1) {
        if (this.prompts.confirm("Đây là tờ cuối cùng. Xóa tờ này sẽ xóa cả Page. Tiếp tục?")) {
          await this.store.deletePage(page.id);
        }
        return;
      }
      if (this.prompts.confirm("Xóa tờ này? Nội dung của tờ sẽ bị xóa.")) {
        await this.store.deleteSheet(sheet.id);
      }
    });
  }
}
