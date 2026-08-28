import { Blend, BookOpen, Copy, Highlighter, Languages, NotebookTabs, RefreshCw, Strikethrough, Underline, Volume2, X } from "lucide-react";
import type { ReaderInteractionController } from "../use-reader-interaction-controller";

export function PdfSelectionMenu({ controller }: { controller: ReaderInteractionController }) {
  const { dictionaryLookup, pdfSelection } = controller;
  if (!pdfSelection) return null;
  return (
    <div className={`pdf-selection-menu placement-${pdfSelection.menuPlacement} ${dictionaryLookup.status === "idle" ? "compact" : "translation-open"}`} style={{ left: pdfSelection.menuX, top: pdfSelection.menuY, maxHeight: pdfSelection.menuMaxHeight }} role="dialog" aria-label="Tra từ và thao tác với đoạn chữ đã chọn">
      <div className="pdf-selection-actions" role="toolbar" aria-label="Thao tác với đoạn chữ">
        <button onClick={() => { void controller.copyPdfSelection(); }} aria-label="Sao chép" title="Sao chép"><Copy size={14} /> Chép</button>
        <button onClick={controller.requestDictionaryLookup} disabled={dictionaryLookup.status === "loading"} aria-label="Dịch Anh sang Việt" title="Dịch Anh sang Việt"><Languages size={14} /> Dịch</button>
        <button onClick={() => controller.addPdfMarkup("highlight")} aria-label="Tô sáng" title="Tô sáng"><Highlighter size={14} /> Tô</button>
        <button onClick={() => controller.addPdfMarkup("underline")} aria-label="Gạch chân" title="Gạch chân"><Underline size={14} /> Chân</button>
        <button onClick={() => controller.addPdfMarkup("strikeout")} aria-label="Gạch ngang" title="Gạch ngang"><Strikethrough size={14} /> Ngang</button>
        <button onClick={() => controller.addPdfMarkup("squiggly")} aria-label="Gạch lượn sóng" title="Gạch lượn sóng"><Blend size={14} /> Lượn</button>
        <button className="send-note" onClick={controller.addSelectionToNote} aria-label="Đưa sang note" title="Đưa sang note"><NotebookTabs size={14} /> Note</button>
        <button onClick={controller.openOxfordLookup} aria-label="Tra Oxford" title="Tra Oxford"><BookOpen size={14} /> Oxford</button>
        <button className="close-selection" onClick={controller.clearSelection} aria-label="Đóng"><X size={14} /></button>
      </div>
      {dictionaryLookup.status !== "idle" && <section className="selection-dictionary" aria-live="polite">
        <header><span><Languages size={15} /><b>Anh → Việt</b></span></header>
        <p className="dictionary-source-text">{dictionaryLookup.sourceText || pdfSelection.text}</p>
        {dictionaryLookup.status === "loading" && <div className="dictionary-loading"><RefreshCw size={14} /> Đang tìm nghĩa và đề xuất bản dịch…</div>}
        {dictionaryLookup.status === "error" && <p className="dictionary-error">{dictionaryLookup.error}</p>}
        {dictionaryLookup.status === "ready" && dictionaryLookup.result && (
          <>
            {dictionaryLookup.result.dictionary && (
              <div className="dictionary-headword">
                <span><strong>{dictionaryLookup.result.dictionary.word}</strong>{dictionaryLookup.result.dictionary.phonetic && <em>{dictionaryLookup.result.dictionary.phonetic}</em>}</span>
                {dictionaryLookup.result.dictionary.audioUrl && <button onClick={controller.playDictionaryAudio} aria-label="Nghe phát âm" title="Nghe phát âm"><Volume2 size={15} /></button>}
              </div>
            )}
            {dictionaryLookup.result.translation ? (
              <div className="translation-suggestion">
                <small>Gợi ý dịch</small>
                <strong>{dictionaryLookup.result.translation}</strong>
                {dictionaryLookup.result.alternatives.length > 0 && <p>Khác: {dictionaryLookup.result.alternatives.join(" · ")}</p>}
                <div><button onClick={() => { void controller.copyTranslation(); }} aria-label="Sao chép bản dịch" title="Sao chép bản dịch"><Copy size={13} /> Chép</button><button className="send-translation" onClick={controller.addTranslationToNote} aria-label="Đưa bản dịch sang note" title="Đưa bản dịch sang note"><NotebookTabs size={13} /> Note</button></div>
              </div>
            ) : <p className="dictionary-error">{dictionaryLookup.result.translationError ?? "Chưa tìm thấy gợi ý dịch phù hợp."}</p>}
            {dictionaryLookup.result.dictionary?.meanings.length ? (
              <details className="english-definitions">
                <summary>Nghĩa tiếng Anh</summary>
                {dictionaryLookup.result.dictionary.meanings.map((meaning, index) => <div key={`${meaning.partOfSpeech}-${index}`}><b>{meaning.partOfSpeech}</b><span>{meaning.definitions.join("; ")}</span></div>)}
              </details>
            ) : null}
          </>
        )}
        <footer>Nghĩa mở: Wiktionary (CC BY-SA) · gợi ý dịch online: MyMemory. Oxford mở ở trang chính thức.</footer>
      </section>}
    </div>
  );
}
