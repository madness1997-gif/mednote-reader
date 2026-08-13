import { Blend, Maximize2, Minus, Move, Pencil, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { localBinaryStorage } from "./local-binary-storage";
import type { ResolvedDocumentSource } from "./note-document-source";
import { DEFAULT_CALLOUT_APPEARANCE, normalizeCalloutSettings, normalizeExcerptAppearance, normalizeExcerptLayout, plainTextToRichHtml, type CalloutSettings, type ExcerptLayout, type NoteExcerpt } from "./note-runtime-adapter";
import type { PdfRect } from "./pdf-domain";
import { RichTextEditor } from "./rich-text-editor";
import { NoteObjectSession } from "./note-object-session";

const objectSession = new NoteObjectSession();

function StoredAssetImage({ assetId, alt }: { assetId: string; alt: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    void localBinaryStorage.readAsset(assetId).then((blob) => {
      if (!blob || disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  return source ? <img src={source} alt={alt} draggable={false} /> : <span className="excerpt-image-loading">Đang mở ảnh…</span>;
}

type DraggableExcerptProps = {
  excerpt: NoteExcerpt;
  source: ResolvedDocumentSource<PdfRect> | null;
  index: number;
  selected: boolean;
  selectable: boolean;
  movable: boolean;
  editable: boolean;
  onSelect: (excerptId: string) => void;
  onMove: (excerptId: string, layout: ExcerptLayout) => void;
  onEdit: (excerptId: string, changes: Partial<NoteExcerpt>) => void;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
  onOpenSource: (excerpt: NoteExcerpt) => void;
  onDelete: (excerptId: string) => void;
};

function DraggableExcerpt({ excerpt, source, index, selected, selectable, movable, editable, onSelect, onMove, onEdit, onTextActivate, onNormalizeTextInput, onOpenSource, onDelete }: DraggableExcerptProps) {
  const articleRef = useRef<HTMLElement>(null);
  const savedLayout = normalizeExcerptLayout(excerpt.layout, index, excerpt.kind);
  const isCallout = excerpt.annotationKind === "callout";
  const appearance = excerpt.kind === "text" ? normalizeExcerptAppearance(excerpt.appearance ?? (isCallout ? DEFAULT_CALLOUT_APPEARANCE : undefined), isCallout) : null;
  const savedCallout = isCallout ? normalizeCalloutSettings(excerpt.callout, savedLayout) : null;
  const [layout, setLayout] = useState(savedLayout);
  const [calloutAnchor, setCalloutAnchor] = useState(savedCallout);
  const interactionRef = useRef<{
    mode: "move" | "resize" | "rotate" | "anchor";
    pointerId: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    origin: ExcerptLayout;
    hostWidth: number;
    hostHeight: number;
    moved: boolean;
    current: ExcerptLayout;
    originAnchor: CalloutSettings | null;
    currentAnchor: CalloutSettings | null;
  } | null>(null);

  useEffect(() => {
    if (!interactionRef.current) setLayout(savedLayout);
  }, [savedLayout.aspectRatio, savedLayout.autoFit, savedLayout.contentScale, savedLayout.height, savedLayout.opacity, savedLayout.rotation, savedLayout.width, savedLayout.x, savedLayout.y]);

  useEffect(() => {
    if (!interactionRef.current) setCalloutAnchor(savedCallout);
  }, [savedCallout?.anchorX, savedCallout?.anchorY]);

  const startInteraction = (event: React.PointerEvent<HTMLElement>, mode: "move" | "resize" | "rotate" | "anchor") => {
    if (!movable) return;
    const host = articleRef.current?.parentElement;
    const article = articleRef.current;
    if (!host || !article) return;
    const rect = host.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    const centerX = articleRect.left + articleRect.width / 2;
    const centerY = articleRect.top + articleRect.height / 2;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
      origin: layout,
      hostWidth: Math.max(1, rect.width),
      hostHeight: Math.max(1, rect.height),
      moved: false,
      current: layout,
      originAnchor: calloutAnchor,
      currentAnchor: calloutAnchor,
    };
  };

  const updateInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.startX) / state.hostWidth;
    const dy = (event.clientY - state.startY) / state.hostHeight;
    if (state.mode === "anchor" && state.originAnchor) {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.currentAnchor = {
        anchorX: Math.min(1, Math.max(0, state.originAnchor.anchorX + dx)),
        anchorY: Math.min(1, Math.max(0, state.originAnchor.anchorY + dy)),
      };
      setCalloutAnchor(state.currentAnchor);
    } else if (state.mode === "rotate") {
      const angle = Math.atan2(event.clientY - state.centerY, event.clientX - state.centerX) * 180 / Math.PI;
      const delta = angle - state.startAngle;
      if (Math.abs(delta) > .5) state.moved = true;
      state.current = {
        ...state.origin,
        rotation: Math.round((((state.origin.rotation + delta + 180) % 360) + 360) % 360 - 180),
      };
    } else if (state.mode === "move") {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.current = {
          ...state.origin,
          x: Math.min(1 - state.origin.width, Math.max(0, state.origin.x + dx)),
          y: Math.min(1 - state.origin.height, Math.max(0, state.origin.y + dy)),
      };
    } else if (state.origin.aspectRatio) {
      const widthFromX = state.origin.width + dx;
      const widthFromY = state.origin.width + dy * state.hostHeight * state.origin.aspectRatio / state.hostWidth;
      const requestedWidth = Math.abs(widthFromX - state.origin.width) >= Math.abs(widthFromY - state.origin.width) ? widthFromX : widthFromY;
      const maxWidthForHeight = (1 - state.origin.y) * state.origin.aspectRatio * state.hostHeight / state.hostWidth;
      const width = Math.min(1 - state.origin.x, maxWidthForHeight, Math.max(.06, requestedWidth));
      const height = width * state.hostWidth / (state.origin.aspectRatio * state.hostHeight);
      if (Math.abs(width - state.origin.width) > .002) state.moved = true;
      state.current = { ...state.origin, width, height };
    } else {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.current = {
          ...state.origin,
          width: Math.min(1 - state.origin.x, Math.max(.025, state.origin.width + dx)),
          height: Math.min(1 - state.origin.y, Math.max(.018, state.origin.height + dy)),
          autoFit: false,
      };
    }
    setLayout(state.current);
  };

  const finishInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    if (!state.moved) return;
    if (state.mode === "anchor" && state.currentAnchor) onEdit(excerpt.id, { callout: state.currentAnchor });
    else onMove(excerpt.id, state.current);
  };

  const changeContentScale = (step: number) => {
    const next = objectSession.contentScale(layout, step);
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const changeOpacity = (opacity: number) => {
    const next = objectSession.opacity(layout, opacity);
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const rotateBy = (degrees: number) => {
    const next = objectSession.rotate(layout, degrees);
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const fitTextBoxToContent = (keepAutoFit = true) => {
    const article = articleRef.current;
    const host = article?.parentElement;
    const editor = article?.querySelector<HTMLElement>(".excerpt-rich-editor");
    if (!article || !host || !editor) return;
    const hostRect = host.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const probe = editor.cloneNode(true) as HTMLElement;
    probe.removeAttribute("data-rich-editor-id");
    probe.removeAttribute("contenteditable");
    probe.classList.add("excerpt-fit-probe");
    article.appendChild(probe);
    probe.style.maxWidth = `${hostRect.width * .86}px`;
    const measured = probe.getBoundingClientRect();
    probe.remove();
    const width = Math.min(1 - layout.x, Math.max(.025, (measured.width + 18) / hostRect.width));
    const height = Math.min(1 - layout.y, Math.max(.018, (measured.height + 16) / hostRect.height));
    const next = { ...layout, width, height, autoFit: keepAutoFit };
    setLayout(next);
    onEdit(excerpt.id, { layout: next });
  };

  useEffect(() => {
    if (excerpt.kind !== "text" || !savedLayout.autoFit || !(excerpt.text ?? "").trim()) return;
    const frame = window.requestAnimationFrame(() => fitTextBoxToContent(true));
    return () => window.cancelAnimationFrame(frame);
    // Refit only when the saved text changes; layout updates are the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excerpt.richText, excerpt.text, savedLayout.autoFit]);

  const calloutTargetX = calloutAnchor ? (calloutAnchor.anchorX - layout.x) / layout.width * 100 : 50;
  const calloutTargetY = calloutAnchor ? (calloutAnchor.anchorY - layout.y) / layout.height * 100 : 50;
  const calloutDeltaX = calloutTargetX - 50;
  const calloutDeltaY = calloutTargetY - 50;
  const calloutEdgeRatio = Math.max(Math.abs(calloutDeltaX) / 50, Math.abs(calloutDeltaY) / 50);
  const calloutStartX = calloutEdgeRatio > 1 ? 50 + calloutDeltaX / calloutEdgeRatio : 50;
  const calloutStartY = calloutEdgeRatio > 1 ? 50 + calloutDeltaY / calloutEdgeRatio : 50;
  const calloutLineColor = appearance?.borderColor && appearance.borderColor !== "transparent" ? appearance.borderColor : "#1b7184";
  const sourceTitle = source
    ? source.available
      ? `Nguồn: ${source.displayName}${source.page ? ` · trang ${source.page}` : ""}. Nhấp đúp để quay lại PDF`
      : `Nguồn PDF không còn trong thư viện: ${source.displayName}`
    : undefined;
  const imageSourceName = source?.displayName ?? (excerpt.sourceKind === "manual" ? excerpt.documentName ?? "Hình ảnh" : "PDF");

  return (
    <article
      ref={articleRef}
      className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.stickerStyle ? `excerpt-sticker sticker-${excerpt.stickerStyle}` : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}
      style={{
        left: `${layout.x * 100}%`,
        top: `${layout.y * 100}%`,
        width: `${layout.width * 100}%`,
        height: `${layout.height * 100}%`,
        zIndex: index + 1,
        transform: `rotate(${layout.rotation}deg)`,
        "--excerpt-content-scale": layout.contentScale,
        "--excerpt-border-style": appearance?.borderStyle,
        "--excerpt-border-width": appearance ? `${appearance.borderWidth}px` : undefined,
        "--excerpt-border-color": appearance?.borderColor,
        "--excerpt-background": appearance?.backgroundColor,
        "--callout-line-color": calloutLineColor,
        "--callout-line-width": `${Math.max(1.5, appearance?.borderWidth ?? 1.5)}px`,
      } as React.CSSProperties}
      onPointerDown={(event) => {
        if (!selectable) return;
        event.stopPropagation();
        onSelect(excerpt.id);
        if (excerpt.kind === "image" && movable && !(event.target as HTMLElement).closest("button,input")) startInteraction(event, "move");
      }}
      onPointerMove={updateInteraction}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onDoubleClick={(event) => {
        if (!source?.available || !source.documentId || !source.page) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenSource(excerpt);
      }}
      title={sourceTitle}
      aria-selected={selected}
    >
      {isCallout && calloutAnchor && <svg className="callout-leader" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={`callout-arrow-${excerpt.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={calloutLineColor} /></marker></defs>
        <line x1={calloutStartX} y1={calloutStartY} x2={calloutTargetX} y2={calloutTargetY} markerEnd={`url(#callout-arrow-${excerpt.id})`} />
      </svg>}
      {selected && (movable || editable) && (
        <div className="excerpt-object-controls">
          <button
            className="excerpt-drag-handle"
            disabled={!movable}
            onPointerDown={(event) => startInteraction(event, "move")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
            aria-label="Kéo để di chuyển khung"
            title={movable ? "Kéo để di chuyển" : "Dùng công cụ Chọn để di chuyển"}
          ><Move size={13} /></button>
          {excerpt.kind === "text" && <span className="excerpt-scale-controls" aria-label="Kích thước nội dung">
            <button onClick={() => changeContentScale(-.12)} disabled={!movable || layout.contentScale <= .65} title="Thu nhỏ nội dung" aria-label="Thu nhỏ nội dung"><Minus size={12} /></button>
            <b>{Math.round(layout.contentScale * 100)}%</b>
            <button onClick={() => changeContentScale(.12)} disabled={!movable || layout.contentScale >= 2.4} title="Phóng to nội dung" aria-label="Phóng to nội dung"><Plus size={12} /></button>
          </span>}
          {excerpt.kind === "text" && <button className={`excerpt-fit-control ${layout.autoFit ? "active" : ""}`} onClick={() => fitTextBoxToContent(true)} title="Ôm sát nội dung và tự co giãn khi nhập" aria-label="Cho hộp chữ ôm sát nội dung">Ôm chữ</button>}
          {excerpt.kind === "image" && <span className="excerpt-opacity-controls" aria-label="Độ trong suốt của ảnh">
            <Blend size={12} />
            <input type="range" min=".1" max="1" step=".05" value={layout.opacity} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => changeOpacity(Number(event.target.value))} aria-label="Độ trong suốt của ảnh" />
            <b>{Math.round(layout.opacity * 100)}%</b>
          </span>}
          {excerpt.kind === "image" && <span className="excerpt-rotation-controls" aria-label="Xoay ảnh">
            <button onClick={() => rotateBy(-15)} title="Xoay trái 15°" aria-label="Xoay trái 15 độ"><RotateCcw size={12} /></button>
            <b>{Math.round(layout.rotation)}°</b>
            <button onClick={() => rotateBy(15)} title="Xoay phải 15°" aria-label="Xoay phải 15 độ"><RotateCw size={12} /></button>
          </span>}
          {excerpt.kind === "text" && <span className="excerpt-edit-indicator"><Pencil size={11} />{editable ? "Đang sửa" : isCallout ? "Callout" : excerpt.stickerStyle ? "Sticker" : "Chữ"}</span>}
          <button className="excerpt-delete-control" onClick={() => onDelete(excerpt.id)} aria-label="Xóa khung" title="Xóa khung"><Trash2 size={12} /></button>
        </div>
      )}
      <div className="excerpt-content">
        {excerpt.kind === "text" ? (
          <RichTextEditor
            editorId={`excerpt:${excerpt.id}`}
            className="excerpt-rich-editor"
            html={excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")}
            editable={editable}
            autoFocus={editable}
            placeholder={excerpt.stickerStyle ? "Nhập ghi chú…" : isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}
            ariaLabel={isCallout ? "Nội dung callout" : excerpt.sourceKind === "manual" ? "Nội dung hộp chữ" : "Nội dung đoạn chữ đưa từ PDF"}
            onChange={(richText, text) => onEdit(excerpt.id, { richText, text })}
            onActivate={onTextActivate}
            onNormalizeInput={onNormalizeTextInput}
          />
        ) : excerpt.assetId ? (
          <div className="excerpt-image-viewport" style={{ opacity: layout.opacity }}><div style={{ transform: `scale(${layout.contentScale})` }}><StoredAssetImage assetId={excerpt.assetId} alt={`Hình từ ${imageSourceName}, trang ${source?.page ?? excerpt.page ?? 1}${source && !source.available ? ", nguồn không còn trong thư viện" : ""}`} /></div></div>
        ) : <span>Không tìm thấy ảnh</span>}
      </div>
      {selected && movable && isCallout && calloutAnchor && <button
        className="callout-anchor-handle"
        style={{ left: `${calloutTargetX}%`, top: `${calloutTargetY}%` }}
        onPointerDown={(event) => startInteraction(event, "anchor")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo đầu mũi tên callout"
        title="Kéo để đổi điểm mà callout chỉ tới"
      ><Move size={11} /></button>}
      {selected && movable && excerpt.kind === "image" && <button
        className="excerpt-rotate-handle"
        onPointerDown={(event) => startInteraction(event, "rotate")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo để xoay ảnh"
        title="Kéo để xoay ảnh"
      ><RotateCw size={13} /></button>}
      {selected && movable && <button
        className="excerpt-resize-handle"
        onPointerDown={(event) => startInteraction(event, "resize")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo để đổi kích thước khung"
        title="Kéo để đổi kích thước khung"
      ><Maximize2 size={11} /></button>}
    </article>
  );
}


export type NoteObjectLayerProps = {
  excerpts: NoteExcerpt[];
  resolveSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;
  selectedId: string | null;
  activeTool: "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";
  interactive?: boolean;
  onSelect: (excerptId: string) => void;
  onMove: (excerptId: string, layout: ExcerptLayout) => void;
  onEdit: (excerptId: string, changes: Partial<NoteExcerpt>) => void;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
  onOpenSource: (excerpt: NoteExcerpt) => void;
  onDelete: (excerptId: string) => void;
};

export function NoteObjectLayer({ excerpts, resolveSource, selectedId, activeTool, interactive = true, onSelect, onMove, onEdit, onTextActivate, onNormalizeTextInput, onOpenSource, onDelete }: NoteObjectLayerProps) {
  return <div className="note-excerpts" aria-label={interactive ? "Khung chữ và ảnh trên trang note" : undefined} aria-hidden={interactive ? undefined : true}>
    {excerpts.map((excerpt, index) => {
      const selected = interactive && excerpt.id === selectedId;
      const calloutTextMode = selected && excerpt.annotationKind === "callout" && activeTool === "text";
      return <DraggableExcerpt key={excerpt.id} excerpt={excerpt} source={resolveSource(excerpt)} index={index} selected={selected} selectable={interactive && (activeTool === "pointer" || activeTool === "text")} movable={interactive && (activeTool === "pointer" || calloutTextMode || (selected && activeTool === "text" && (excerpt.kind === "text" || excerpt.kind === "image")))} editable={interactive && activeTool === "text" && selected && excerpt.kind === "text"} onSelect={onSelect} onMove={onMove} onEdit={onEdit} onTextActivate={onTextActivate} onNormalizeTextInput={onNormalizeTextInput} onOpenSource={onOpenSource} onDelete={onDelete} />;
    })}
  </div>;
}
