export type NoteSymbolLibraryKind = "icon" | "emoji";
export type NoteSymbolLibraryItem = { value: string; name: string; keywords: string };
export type NoteSymbolLibraryGroup = { label: string; kind: NoteSymbolLibraryKind; items: NoteSymbolLibraryItem[] };

const RECENT_KEY = "mednote-recent-note-symbols";

export const NOTE_SYMBOL_GROUPS: NoteSymbolLibraryGroup[] = [
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

export function readRecentNoteSymbols() {
  try {
    const values = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 16) : [];
  } catch { return []; }
}

export function rememberRecentNoteSymbol(value: string) {
  const next = [value, ...readRecentNoteSymbols().filter((item) => item !== value)].slice(0, 16);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
