type LibraryKind = "icon" | "emoji";
type LibraryItem = { value: string; name: string; keywords: string };
type LibraryGroup = { label: string; kind: LibraryKind; items: LibraryItem[] };

const RECENT_KEY = "mednote-recent-note-symbols";

const GROUPS: LibraryGroup[] = [
  {
    label: "Đánh dấu",
    kind: "icon",
    items: [
      ["✓", "Dấu đúng", "dung dung check tick"], ["✔", "Hoàn thành", "hoan thanh check"],
      ["☑", "Ô đã chọn", "checkbox da chon"], ["☐", "Ô chưa chọn", "checkbox chua chon"],
      ["✕", "Dấu sai", "sai x cross"], ["✖", "Loại bỏ", "loai bo close"],
      ["★", "Sao đặc", "sao quan trong star"], ["☆", "Sao rỗng", "sao rong star"],
      ["●", "Chấm đặc", "cham tron bullet"], ["○", "Chấm rỗng", "cham rong circle"],
      ["◆", "Hình thoi đặc", "hinh thoi diamond"], ["◇", "Hình thoi rỗng", "hinh thoi rong"],
      ["■", "Ô vuông đặc", "vuong square"], ["□", "Ô vuông rỗng", "vuong rong"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Mũi tên & liên kết",
    kind: "icon",
    items: [
      ["←", "Mũi tên trái", "trai left"], ["→", "Mũi tên phải", "phai right"],
      ["↑", "Mũi tên lên", "len up tang"], ["↓", "Mũi tên xuống", "xuong down giam"],
      ["↔", "Hai chiều ngang", "hai chieu ngang"], ["↕", "Hai chiều dọc", "hai chieu doc"],
      ["⇒", "Suy ra", "suy ra implies"], ["⇔", "Tương đương", "tuong duong equivalent"],
      ["➜", "Chuyển tiếp", "chuyen tiep arrow"], ["➤", "Mũi tên nhấn mạnh", "nhan manh arrow"],
      ["⟶", "Mũi tên dài phải", "mui ten dai phai"], ["⟵", "Mũi tên dài trái", "mui ten dai trai"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Ghi chú & học tập",
    kind: "icon",
    items: [
      ["✎", "Ghi chú", "ghi chu viet"], ["✏", "Bút chì", "but chi viet"],
      ["✍", "Viết tay", "viet tay"], ["⌂", "Trang chủ", "trang chu home"],
      ["⚑", "Cờ đánh dấu", "co danh dau flag"], ["⚐", "Cờ rỗng", "co rong flag"],
      ["ⓘ", "Thông tin", "thong tin info"], ["⚠", "Cảnh báo", "canh bao warning"],
      ["⊕", "Thêm", "them plus"], ["⊖", "Bớt", "bot minus"],
      ["∴", "Do đó", "do do therefore"], ["∵", "Bởi vì", "boi vi because"],
      ["①", "Số 1 khoanh", "so mot 1"], ["②", "Số 2 khoanh", "so hai 2"],
      ["③", "Số 3 khoanh", "so ba 3"], ["④", "Số 4 khoanh", "so bon 4"],
      ["⑤", "Số 5 khoanh", "so nam 5"], ["⑥", "Số 6 khoanh", "so sau 6"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Y khoa",
    kind: "icon",
    items: [
      ["⚕", "Biểu tượng y khoa", "y khoa medical"], ["♀", "Nữ", "nu female"],
      ["♂", "Nam", "nam male"], ["♥", "Tim đặc", "tim heart"],
      ["♡", "Tim rỗng", "tim rong heart"], ["†", "Dấu thập", "dau thap cross"],
      ["‡", "Dấu thập đôi", "dau thap doi"], ["°", "Độ", "do degree"],
      ["℃", "Độ C", "do c celsius"], ["℉", "Độ F", "do f fahrenheit"],
      ["µ", "Micro", "micro vi"], ["‰", "Phần nghìn", "phan nghin per mille"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Cảm xúc",
    kind: "emoji",
    items: [
      ["😀", "Vui vẻ", "vui smile"], ["😄", "Cười", "cuoi happy"], ["😊", "Mỉm cười", "mim cuoi"],
      ["🙂", "Bình thường", "binh thuong"], ["🤔", "Suy nghĩ", "suy nghi think"], ["😮", "Ngạc nhiên", "ngac nhien"],
      ["😅", "Nhẹ nhõm", "nhe nhom"], ["😎", "Tự tin", "tu tin cool"], ["😢", "Buồn", "buon sad"],
      ["😴", "Buồn ngủ", "buon ngu sleep"], ["🤯", "Quá tải", "qua tai mind blown"], ["🥳", "Chúc mừng", "chuc mung party"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Cử chỉ",
    kind: "emoji",
    items: [
      ["👍", "Đồng ý", "dong y like"], ["👎", "Không đồng ý", "khong dong y dislike"],
      ["👌", "Ổn", "on okay"], ["✌️", "Chiến thắng", "chien thang victory"],
      ["👏", "Vỗ tay", "vo tay clap"], ["🙌", "Hoan hô", "hoan ho"],
      ["🙏", "Cảm ơn", "cam on pray"], ["👆", "Chỉ lên", "chi len"],
      ["👇", "Chỉ xuống", "chi xuong"], ["👉", "Chỉ phải", "chi phai"],
      ["👈", "Chỉ trái", "chi trai"], ["💪", "Sức mạnh", "suc manh strong"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Học tập & công việc",
    kind: "emoji",
    items: [
      ["📌", "Ghim", "ghim pin"], ["📍", "Vị trí", "vi tri location"], ["📝", "Ghi chú", "ghi chu memo"],
      ["✏️", "Bút chì", "but chi pencil"], ["📖", "Sách mở", "sach mo book"], ["📚", "Sách", "sach books"],
      ["🔖", "Đánh dấu trang", "danh dau trang bookmark"], ["💡", "Ý tưởng", "y tuong idea"],
      ["🎯", "Mục tiêu", "muc tieu target"], ["🔍", "Tìm kiếm", "tim kiem search"],
      ["📊", "Biểu đồ", "bieu do chart"], ["📈", "Tăng", "tang trend"],
      ["📉", "Giảm", "giam trend"], ["🗂️", "Phân loại", "phan loai folder"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Y tế & khoa học",
    kind: "emoji",
    items: [
      ["🩺", "Ống nghe", "ong nghe stethoscope"], ["💊", "Thuốc", "thuoc pill"], ["💉", "Tiêm", "tiem syringe"],
      ["🩸", "Máu", "mau blood"], ["🧬", "DNA", "dna gene"], ["🦠", "Vi sinh vật", "vi sinh vat germ"],
      ["🧠", "Não", "nao brain"], ["🫀", "Tim", "tim heart"], ["🫁", "Phổi", "phoi lung"],
      ["🦴", "Xương", "xuong bone"], ["🦷", "Răng", "rang tooth"], ["🧪", "Ống nghiệm", "ong nghiem test tube"],
      ["🧫", "Đĩa cấy", "dia cay petri"], ["🏥", "Bệnh viện", "benh vien hospital"], ["⚕️", "Y khoa", "y khoa medical"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
  {
    label: "Trạng thái",
    kind: "emoji",
    items: [
      ["✅", "Hoàn thành", "hoan thanh done"], ["❌", "Sai", "sai error"], ["⚠️", "Cảnh báo", "canh bao warning"],
      ["ℹ️", "Thông tin", "thong tin info"], ["⏳", "Đang chờ", "dang cho waiting"], ["⏰", "Nhắc giờ", "nhac gio alarm"],
      ["🔥", "Nổi bật", "noi bat hot"], ["⭐", "Quan trọng", "quan trong star"], ["🚩", "Cờ đỏ", "co do red flag"],
      ["🟢", "Trạng thái xanh", "xanh green"], ["🟡", "Trạng thái vàng", "vang yellow"], ["🔴", "Trạng thái đỏ", "do red"],
    ].map(([value, name, keywords]) => ({ value, name, keywords })),
  },
];

const allItems = GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, kind: group.kind })));
const itemByValue = new Map(allItems.map((item) => [item.value, item]));

let savedRange: Range | null = null;
let savedInput: { element: HTMLInputElement | HTMLTextAreaElement; start: number; end: number } | null = null;

function insideNotes(element: Element | null) {
  return Boolean(element?.closest(".notes-pane, .note-paper"));
}

function rememberTextInput(element: HTMLInputElement | HTMLTextAreaElement) {
  if (!insideNotes(element)) return;
  savedInput = {
    element,
    start: element.selectionStart ?? element.value.length,
    end: element.selectionEnd ?? element.value.length,
  };
  savedRange = null;
}

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  if (!insideNotes(element) || !element?.closest("[contenteditable='true']")) return;
  savedRange = range.cloneRange();
  savedInput = null;
});

for (const eventName of ["focusin", "select", "keyup", "mouseup"] as const) {
  document.addEventListener(eventName, (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) rememberTextInput(target);
  }, true);
}

function dispatchInput(element: HTMLElement, value: string) {
  try {
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function insertAtSavedSelection(value: string) {
  if (savedInput?.element.isConnected && insideNotes(savedInput.element)) {
    const { element, start, end } = savedInput;
    element.focus();
    element.setRangeText(value, start, end, "end");
    rememberTextInput(element);
    dispatchInput(element, value);
    return true;
  }

  if (savedRange) {
    const node = savedRange.commonAncestorContainer;
    const origin = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const editable = origin?.closest<HTMLElement>("[contenteditable='true']");
    if (editable?.isConnected && insideNotes(editable)) {
      editable.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
      const inserted = document.execCommand("insertText", false, value);
      if (!inserted) {
        savedRange.deleteContents();
        const text = document.createTextNode(value);
        savedRange.insertNode(text);
        savedRange.setStartAfter(text);
        savedRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(savedRange);
      }
      if (selection?.rangeCount) savedRange = selection.getRangeAt(0).cloneRange();
      dispatchInput(editable, value);
      return true;
    }
  }

  const fallback = document.querySelector<HTMLElement>(".notes-pane .note-paper [contenteditable='true']");
  if (!fallback) return false;
  fallback.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(fallback);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRange = range.cloneRange();
  return insertAtSavedSelection(value);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function readRecent() {
  try {
    const values = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

function rememberRecent(value: string) {
  const next = [value, ...readRecent().filter((item) => item !== value)].slice(0, 16);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function makeSymbolButton(item: LibraryItem, onInsert: (value: string) => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-symbol-item";
  button.textContent = item.value;
  button.title = item.name;
  button.setAttribute("aria-label", `${item.name}: ${item.value}`);
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => onInsert(item.value));
  return button;
}

function enhancePopover(popover: HTMLElement) {
  if (popover.querySelector(".note-symbol-library")) return;
  popover.classList.add("symbol-library-ready");

  const library = document.createElement("div");
  library.className = "note-symbol-library";
  library.innerHTML = `
    <div class="note-symbol-tabs" role="tablist">
      <button type="button" class="active" data-kind="icon" role="tab" aria-selected="true">Icon</button>
      <button type="button" data-kind="emoji" role="tab" aria-selected="false">Emoji</button>
    </div>
    <label class="note-symbol-search">
      <span>⌕</span>
      <input type="search" placeholder="Tìm icon hoặc emoji…" autocomplete="off" />
    </label>
    <div class="note-symbol-results"></div>
    <footer>Bấm để chèn tại vị trí con trỏ · Icon và emoji sẽ theo cỡ chữ của note</footer>
  `;
  popover.appendChild(library);

  const tabs = Array.from(library.querySelectorAll<HTMLButtonElement>(".note-symbol-tabs button"));
  const search = library.querySelector<HTMLInputElement>("input")!;
  const results = library.querySelector<HTMLElement>(".note-symbol-results")!;
  let activeKind: LibraryKind = "icon";
  let query = "";

  const render = () => {
    results.replaceChildren();
    const normalizedQuery = normalize(query);
    const recent = readRecent()
      .map((value) => itemByValue.get(value))
      .filter((item): item is (LibraryItem & { kind: LibraryKind }) => Boolean(item && item.kind === activeKind))
      .filter((item) => !normalizedQuery || normalize(`${item.value} ${item.name} ${item.keywords}`).includes(normalizedQuery));

    const insert = (value: string) => {
      if (!insertAtSavedSelection(value)) return;
      rememberRecent(value);
      render();
    };

    if (recent.length) {
      const section = document.createElement("section");
      section.innerHTML = "<label>Gần đây</label>";
      const grid = document.createElement("div");
      grid.className = "note-symbol-grid";
      recent.forEach((item) => grid.appendChild(makeSymbolButton(item, insert)));
      section.appendChild(grid);
      results.appendChild(section);
    }

    let visibleCount = 0;
    GROUPS.filter((group) => group.kind === activeKind).forEach((group) => {
      const items = group.items.filter((item) => !normalizedQuery || normalize(`${item.value} ${item.name} ${item.keywords}`).includes(normalizedQuery));
      if (!items.length) return;
      visibleCount += items.length;
      const section = document.createElement("section");
      const label = document.createElement("label");
      label.textContent = group.label;
      const grid = document.createElement("div");
      grid.className = "note-symbol-grid";
      items.forEach((item) => grid.appendChild(makeSymbolButton(item, insert)));
      section.append(label, grid);
      results.appendChild(section);
    });

    if (!visibleCount) {
      const empty = document.createElement("div");
      empty.className = "note-symbol-empty";
      empty.textContent = "Không tìm thấy biểu tượng phù hợp.";
      results.appendChild(empty);
    }
  };

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeKind = tab.dataset.kind as LibraryKind;
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    render();
  }));
  search.addEventListener("input", () => {
    query = search.value;
    render();
  });
  render();
}

function scan() {
  document.querySelectorAll<HTMLElement>(".symbol-popover").forEach(enhancePopover);
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();

export {};
