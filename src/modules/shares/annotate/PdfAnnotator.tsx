import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Check, Highlighter, MessageSquarePlus, MousePointer2, Trash2, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/Button";
import type { DocAnnotation } from "@/lib/database.types";
import { loadPdf, pageDimensions, renderPage, type PageDims } from "./pdf";
import {
  DEFAULT_HIGHLIGHT,
  HIGHLIGHT_COLORS,
  pixelDragToNormBox,
  pixelPointToNorm,
} from "./geometry";

type Tool = "view" | "highlight" | "comment";

export function PdfAnnotator({
  bytes,
  initialAnnotations,
  title,
  addedBy,
  saving,
  onSave,
  onCancel,
}: {
  bytes: Uint8Array;
  initialAnnotations: DocAnnotation[];
  title: string;
  addedBy: string | null;
  saving: boolean;
  onSave: (annotations: DocAnnotation[]) => void;
  onCancel: () => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [dims, setDims] = useState<PageDims[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<DocAnnotation[]>(initialAnnotations);
  const [tool, setTool] = useState<Tool>("highlight");
  const [color, setColor] = useState<string>(DEFAULT_HIGHLIGHT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadPdf(bytes)
      .then(async (d) => {
        if (cancelled) return;
        const pd = await pageDimensions(d);
        if (cancelled) return;
        setDoc(d);
        setDims(pd);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not open PDF"));
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(el.clientWidth, 900));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // Stable comment numbering, matching the flattened export.
  const commentNumber = useMemo(() => {
    const map = new Map<string, number>();
    annotations
      .filter((a) => a.type === "comment")
      .sort((a, b) => a.page - b.page || a.addedAt.localeCompare(b.addedAt))
      .forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [annotations]);

  const addHighlight = useCallback(
    (page: number, box: { x: number; y: number; w: number; h: number }) => {
      if (box.w < 0.005 || box.h < 0.005) return;
      setAnnotations((prev) => [
        ...prev,
        {
          id: uuid(),
          page,
          type: "highlight",
          rect: box,
          color,
          addedAt: new Date().toISOString(),
          addedBy,
        },
      ]);
    },
    [color, addedBy],
  );

  const addComment = useCallback(
    (page: number, pt: { x: number; y: number }) => {
      const id = uuid();
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          page,
          type: "comment",
          x: pt.x,
          y: pt.y,
          text: "",
          addedAt: new Date().toISOString(),
          addedBy,
        },
      ]);
      setEditingId(id);
    },
    [addedBy],
  );

  const updateComment = useCallback((id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
  }, []);

  function handleSave() {
    // Drop empty comments so a stray tap doesn't litter the export.
    onSave(annotations.filter((a) => a.type !== "comment" || (a.text ?? "").trim().length > 0));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <button
          onClick={onCancel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:text-text"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <Button size="sm" onClick={handleSave} disabled={saving || !doc}>
          {saving ? "Saving…" : <Check className="h-4 w-4" />}
          <span className="ml-1">{saving ? "" : "Save to library"}</span>
        </Button>
      </header>

      <div className="flex items-center gap-1 border-b border-line bg-surface px-3 py-2">
        <ToolButton active={tool === "view"} onClick={() => setTool("view")} label="Scroll">
          <MousePointer2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton active={tool === "highlight"} onClick={() => setTool("highlight")} label="Highlight">
          <Highlighter className="h-4 w-4" />
        </ToolButton>
        <ToolButton active={tool === "comment"} onClick={() => setTool("comment")} label="Comment">
          <MessageSquarePlus className="h-4 w-4" />
        </ToolButton>
        {tool === "highlight" && (
          <div className="ml-2 flex items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-text" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={`Highlight colour ${c}`}
              />
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-muted">
          {annotations.length} mark{annotations.length === 1 ? "" : "s"}
        </span>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-surface2 px-2 py-3">
        {error && (
          <div className="mx-auto max-w-md rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}
        {!doc && !error && <p className="py-10 text-center text-sm text-muted">Opening document…</p>}
        {doc &&
          width > 0 &&
          dims.map((pd) => (
            <PdfPage
              key={pd.index}
              doc={doc}
              dims={pd}
              width={width}
              tool={tool}
              color={color}
              annotations={annotations.filter((a) => a.page === pd.index + 1)}
              commentNumber={commentNumber}
              editingId={editingId}
              onAddHighlight={addHighlight}
              onAddComment={addComment}
              onEditComment={setEditingId}
              onUpdateComment={updateComment}
              onRemove={removeAnnotation}
            />
          ))}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
        active ? "bg-accent text-bg" : "text-muted hover:bg-surface2 hover:text-text"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function PdfPage({
  doc,
  dims,
  width,
  tool,
  color,
  annotations,
  commentNumber,
  editingId,
  onAddHighlight,
  onAddComment,
  onEditComment,
  onUpdateComment,
  onRemove,
}: {
  doc: PDFDocumentProxy;
  dims: PageDims;
  width: number;
  tool: Tool;
  color: string;
  annotations: DocAnnotation[];
  commentNumber: Map<string, number>;
  editingId: string | null;
  onAddHighlight: (page: number, box: { x: number; y: number; w: number; h: number }) => void;
  onAddComment: (page: number, pt: { x: number; y: number }) => void;
  onEditComment: (id: string | null) => void;
  onUpdateComment: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pageNo = dims.index + 1;
  const height = width * (dims.height / dims.width);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    void renderPage(doc, pageNo, width, canvasRef.current).catch(() => {
      if (!cancelled) {
        /* a failed page render leaves a blank canvas; overlay still works */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNo, width]);

  function localPoint(e: React.PointerEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top, w: rect.width, h: rect.height };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (tool === "view") return;
    const { px, py, w, h } = localPoint(e);
    if (tool === "comment") {
      onAddComment(pageNo, pixelPointToNorm(px, py, w, h));
      return;
    }
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragStart.current = { x: px, y: py };
    setDrag({ x0: px, y0: py, x1: px, y1: py });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (tool !== "highlight" || !dragStart.current) return;
    const { px, py } = localPoint(e);
    setDrag({ x0: dragStart.current.x, y0: dragStart.current.y, x1: px, y1: py });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (tool !== "highlight" || !dragStart.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const box = pixelDragToNormBox(
      dragStart.current.x,
      dragStart.current.y,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
    );
    onAddHighlight(pageNo, box);
    dragStart.current = null;
    setDrag(null);
  }

  const cursor = tool === "view" ? "default" : tool === "comment" ? "copy" : "crosshair";

  return (
    <div className="relative mx-auto mb-3 shadow-lg" style={{ width, height }}>
      <canvas ref={canvasRef} className="block rounded-sm bg-white" />
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ cursor, touchAction: tool === "view" ? "auto" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {annotations.map((a) =>
          a.type === "highlight" && a.rect ? (
            <Highlight key={a.id} ann={a} onRemove={() => onRemove(a.id)} interactive={tool === "view"} />
          ) : a.type === "comment" && a.x != null && a.y != null ? (
            <CommentPin
              key={a.id}
              ann={a}
              num={commentNumber.get(a.id) ?? 0}
              editing={editingId === a.id}
              onOpen={() => onEditComment(a.id)}
              onClose={() => onEditComment(null)}
              onChange={(t) => onUpdateComment(a.id, t)}
              onRemove={() => onRemove(a.id)}
            />
          ) : null,
        )}
        {drag && (
          <div
            className="absolute border border-black/30"
            style={{
              left: `${Math.min(drag.x0, drag.x1)}px`,
              top: `${Math.min(drag.y0, drag.y1)}px`,
              width: `${Math.abs(drag.x1 - drag.x0)}px`,
              height: `${Math.abs(drag.y1 - drag.y0)}px`,
              backgroundColor: color,
              opacity: 0.35,
            }}
          />
        )}
      </div>
    </div>
  );
}

function Highlight({
  ann,
  onRemove,
  interactive,
}: {
  ann: DocAnnotation;
  onRemove: () => void;
  interactive: boolean;
}) {
  const r = ann.rect!;
  return (
    <div
      className="group absolute"
      style={{
        left: `${r.x * 100}%`,
        top: `${r.y * 100}%`,
        width: `${r.w * 100}%`,
        height: `${r.h * 100}%`,
        backgroundColor: ann.color ?? DEFAULT_HIGHLIGHT,
        opacity: 0.35,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {interactive && (
        <button
          onClick={onRemove}
          className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-bg text-warn shadow group-hover:flex"
          aria-label="Remove highlight"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function CommentPin({
  ann,
  num,
  editing,
  onOpen,
  onClose,
  onChange,
  onRemove,
}: {
  ann: DocAnnotation;
  num: number;
  editing: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="absolute"
      style={{ left: `${ann.x! * 100}%`, top: `${ann.y! * 100}%`, pointerEvents: "auto" }}
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onOpen}
        className="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-black shadow ring-2 ring-white"
        aria-label={`Comment ${num}`}
      >
        {num}
      </button>
      {editing && (
        <div
          className="absolute left-2 top-2 z-10 w-60 rounded-xl border border-line bg-surface p-2 shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            autoFocus
            value={ann.text ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Add a comment…"
            className="h-24 w-full resize-none rounded-lg border border-line bg-surface2 p-2 text-sm text-text outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={onRemove}
              className="flex items-center gap-1 text-xs text-warn"
              aria-label="Delete comment"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
