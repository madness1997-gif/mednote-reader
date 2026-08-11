import NoteSidebar from "../note-sidebar";

export function NoteNavigationHost({ setNoteSidebarVisibility }: { setNoteSidebarVisibility: (visible: boolean) => void }) {
  return (<><aside className="note-navigation-host" aria-label="Điều hướng ghi chú"><NoteSidebar onRequestClose={() => setNoteSidebarVisibility(false)} /></aside></>);
}
