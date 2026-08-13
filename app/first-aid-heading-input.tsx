import { useEffect, useRef } from "react";
import type { FirstAidBlock } from "./first-aid-block-domain";
import { plainTextToRichHtml } from "./first-aid-block-renderer";

type FirstAidHeadingInputProps = {
  block: FirstAidBlock;
  canEdit: boolean;
  updateBlock: (id: string, changes: Partial<FirstAidBlock>) => void;
};

/**
 * A native uncontrolled input is intentional here.
 * Samsung/Vietnamese IMEs own the DOM value and caret while the field is active;
 * React only receives committed text and never writes value back mid-composition.
 */
export function FirstAidHeadingInput({ block, canEdit, updateBlock }: FirstAidHeadingInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const committedRef = useRef(block.title ?? "");

  useEffect(() => {
    const input = inputRef.current;
    const next = block.title ?? "";
    if (!input || composingRef.current || document.activeElement === input) return;
    if (input.value !== next) input.value = next;
    committedRef.current = next;
  }, [block.title]);

  const commit = (title: string) => {
    if (title === committedRef.current) return;
    committedRef.current = title;
    updateBlock(block.id, { title, titleHtml: plainTextToRichHtml(title) });
  };

  return <input
    ref={inputRef}
    className="fa-heading-input fa-heading-native-input"
    type="text"
    defaultValue={block.title ?? ""}
    readOnly={!canEdit}
    placeholder="TIÊU ĐỀ MỤC"
    aria-label="Tiêu đề mục"
    spellCheck={false}
    autoComplete="off"
    autoCorrect="off"
    onCompositionStart={() => { composingRef.current = true; }}
    onCompositionEnd={(event) => {
      composingRef.current = false;
      commit(event.currentTarget.value);
    }}
    onInput={(event) => {
      if (composingRef.current || event.nativeEvent.isComposing) return;
      commit(event.currentTarget.value);
    }}
    onBlur={(event) => {
      composingRef.current = false;
      commit(event.currentTarget.value);
    }}
  />;
}
