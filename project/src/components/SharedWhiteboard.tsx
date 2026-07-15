import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eraser, FileText, ImagePlus, Pen, Trash2, Type, X } from "lucide-react";
import type { WhiteboardMedia, WhiteboardStroke } from "../lib/roomTypes.ts";

type Props = {
  strokes: WhiteboardStroke[];
  media: WhiteboardMedia[];
  onStrokeComplete: (stroke: WhiteboardStroke) => void;
  onMediaAdd: (item: WhiteboardMedia) => void;
  onMediaMove: (id: string, x: number, y: number) => void;
  onMediaRemove: (id: string) => void;
  onClear: () => void;
  userId: string;
  userName: string;
  /** When false, board is view-only (guests without host permission) */
  canDraw?: boolean;
};

export type SharedWhiteboardHandle = {
  /** Snapshot of board + images for AI vision */
  exportBoardDataUrl: (type?: string, quality?: number) => string | null;
};

const COLORS = ["#1a3324", "#4f8f28", "#1d4ed8", "#b45309", "#be123c", "#ffffff"];
const BOARD_BG = "#fbfef8";
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;

/**
 * Shared canvas whiteboard with pen/eraser + draggable images/files/text.
 * Double-tap empty board to type; double-tap / ✕ a sticker to remove it.
 */
export const SharedWhiteboard = forwardRef<SharedWhiteboardHandle, Props>(function SharedWhiteboard(
  {
    strokes,
    media,
    onStrokeComplete,
    onMediaAdd,
    onMediaMove,
    onMediaRemove,
    onClear,
    userId,
    userName,
    canDraw = true,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<Array<{ x: number; y: number; p?: number }>>([]);
  const boardSizeRef = useRef({ w: 1, h: 1 });
  const toolRef = useRef<"pen" | "eraser">("pen");
  const colorRef = useRef("#1a3324");
  const widthRef = useRef(3);
  const eraserWidthRef = useRef(18);
  const strokesRef = useRef(strokes);
  const userIdRef = useRef(userId);
  const userNameRef = useRef(userName);
  const rafPaintRef = useRef(0);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const boardTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#1a3324");
  const [width, setWidth] = useState(3);
  const [eraserWidth, setEraserWidth] = useState(18);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ w: 1, h: 1 });
  const [draft, setDraft] = useState<{ x: number; y: number; text: string } | null>(null);

  const activeWidth = tool === "eraser" ? eraserWidth : width;
  toolRef.current = tool;
  colorRef.current = color;
  widthRef.current = width;
  eraserWidthRef.current = eraserWidth;
  strokesRef.current = strokes;
  userIdRef.current = userId;
  userNameRef.current = userName;

  useEffect(() => {
    if (draft) textInputRef.current?.focus();
  }, [draft]);

  useImperativeHandle(ref, () => ({
    exportBoardDataUrl: (type = "image/jpeg", quality = 0.7) => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width < 2 || canvas.height < 2) return null;
      try {
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) return canvas.toDataURL(type, quality);
        ctx.drawImage(canvas, 0, 0);

        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.width / dpr;
        const cssH = canvas.height / dpr;

        const nodes = containerRef.current?.querySelectorAll<HTMLImageElement>("[data-board-img]");
        nodes?.forEach((img) => {
          const id = img.dataset.boardImg;
          const item = media.find((m) => m.id === id);
          if (!item) return;
          const iw = item.w * cssW;
          const ih = img.naturalHeight
            ? (img.naturalHeight / img.naturalWidth) * iw
            : iw * 0.75;
          ctx.drawImage(img, item.x * cssW * dpr, item.y * cssH * dpr, iw * dpr, ih * dpr);
        });

        for (const item of media) {
          if (item.kind !== "text" || !item.text) continue;
          const fontPx = Math.max(14, item.w * cssW * 0.14);
          ctx.fillStyle = item.color || "#1a3324";
          ctx.font = `600 ${fontPx * dpr}px "Segoe UI", system-ui, sans-serif`;
          ctx.textBaseline = "top";
          const lines = item.text.split("\n");
          let ly = item.y * cssH * dpr;
          const lx = item.x * cssW * dpr;
          const lineH = fontPx * dpr * 1.25;
          for (const line of lines.slice(0, 40)) {
            ctx.fillText(line, lx, ly, item.w * cssW * dpr);
            ly += lineH;
          }
        }

        return out.toDataURL(type, quality);
      } catch {
        try {
          return canvas.toDataURL(type, quality);
        } catch {
          return null;
        }
      }
    },
  }));

  /** Resize backing stores only when the board CSS size changes (never every pointermove). */
  const ensureCanvasSize = (): { w: number; h: number; dpr: number } | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const prev = boardSizeRef.current;
    const sizeChanged = prev.w !== w || prev.h !== h;

    if (sizeChanged) {
      boardSizeRef.current = { w, h };
      setBoardSize({ w, h });
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    if (!inkCanvasRef.current) inkCanvasRef.current = document.createElement("canvas");
    const ink = inkCanvasRef.current;
    if (sizeChanged || ink.width !== Math.floor(w * dpr) || ink.height !== Math.floor(h * dpr)) {
      ink.width = Math.floor(w * dpr);
      ink.height = Math.floor(h * dpr);
    }

    return { w, h, dpr };
  };

  const paintGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(197, 221, 184, 0.45)";
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  };

  /** Rebuild committed strokes onto the offscreen ink layer. */
  const rebuildInk = () => {
    const size = ensureCanvasSize();
    const ink = inkCanvasRef.current;
    if (!size || !ink) return;
    const { w, h, dpr } = size;
    const inkCtx = ink.getContext("2d");
    if (!inkCtx) return;
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    inkCtx.clearRect(0, 0, w, h);
    for (const stroke of strokesRef.current) paintStroke(inkCtx, stroke, w, h);
  };

  /** Composite ink + in-progress stroke onto the visible canvas. Cheap: no canvas realloc. */
  const paintFrame = () => {
    const canvas = canvasRef.current;
    const ink = inkCanvasRef.current;
    const size = ensureCanvasSize();
    if (!canvas || !ink || !size) return;
    const { w, h, dpr } = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintGrid(ctx, w, h);
    ctx.drawImage(ink, 0, 0, w, h);

    const pts = currentPointsRef.current;
    if (pts.length >= 1) {
      const aw =
        toolRef.current === "eraser" ? eraserWidthRef.current : widthRef.current;
      paintStroke(
        ctx,
        {
          id: "local",
          points: pts,
          color: colorRef.current,
          width: aw,
          tool: toolRef.current,
          userId: userIdRef.current,
          name: userNameRef.current,
        },
        w,
        h
      );
    }
  };

  const schedulePaint = () => {
    if (rafPaintRef.current) return;
    rafPaintRef.current = requestAnimationFrame(() => {
      rafPaintRef.current = 0;
      paintFrame();
    });
  };

  const redraw = () => {
    rebuildInk();
    paintFrame();
  };

  useEffect(() => {
    redraw();
    const ro = new ResizeObserver(() => {
      // Size changed → rebuild ink so strokes stay sharp after layout shifts
      redraw();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      if (rafPaintRef.current) cancelAnimationFrame(rafPaintRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rebuildInk();
    paintFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, color, width, eraserWidth, tool]);

  const normPoint = (clientX: number, clientY: number, pressure?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
      p: typeof pressure === "number" && pressure > 0 ? pressure : undefined,
    };
  };

  const startTextAt = (x: number, y: number) => {
    drawingRef.current = false;
    currentPointsRef.current = [];
    boardTapRef.current = null;
    setSelectedId(null);
    setTool("pen");
    setDraft({ x, y, text: "" });
    schedulePaint();
  };

  const commitDraft = () => {
    if (!draft) return;
    const text = draft.text.trim();
    const { x, y } = draft;
    setDraft(null);
    if (!text) return;
    const item: WhiteboardMedia = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "text",
      name: text.slice(0, 80),
      mime: "text/plain",
      dataUrl: "",
      text: text.slice(0, 2000),
      color,
      x: Math.min(0.92, Math.max(0, x)),
      y: Math.min(0.92, Math.max(0, y)),
      w: 0.3,
      userId,
      userName,
    };
    onMediaAdd(item);
    setSelectedId(item.id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDraw || draft) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    currentPointsRef.current = [];
    setSelectedId(null);
    const p = normPoint(e.clientX, e.clientY, e.pressure);
    if (p) {
      currentPointsRef.current.push(p);
      setCursorPos({ x: e.clientX, y: e.clientY });
      schedulePaint();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (canvas && tool === "eraser") {
      const rect = canvas.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      setCursorPos(inside ? { x: e.clientX, y: e.clientY } : null);
    } else if (tool !== "eraser") {
      setCursorPos(null);
    }

    if (!drawingRef.current) return;
    e.preventDefault();
    const p = normPoint(e.clientX, e.clientY, e.pressure);
    if (!p) return;

    const pts = currentPointsRef.current;
    const last = pts[pts.length - 1];
    // Skip near-duplicate samples so drawing stays smooth without flooding the main thread / socket
    if (
      last &&
      Math.hypot(p.x - last.x, p.y - last.y) < 0.002 &&
      pts.length > 1
    ) {
      return;
    }
    pts.push(p);
    schedulePaint();
  };

  const endStroke = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    const points = currentPointsRef.current;
    currentPointsRef.current = [];
    const minPts = tool === "eraser" ? 1 : 2;

    // Short pen taps: double-tap empty board → keyboard text
    if (tool === "pen" && points.length > 0 && points.length < minPts + 2) {
      let travel = 0;
      for (let i = 1; i < points.length; i++) {
        travel += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      }
      if (travel < 0.025) {
        const p = points[0];
        const now = Date.now();
        const last = boardTapRef.current;
        if (last && now - last.t < 400 && Math.hypot(p.x - last.x, p.y - last.y) < 0.06) {
          startTextAt(p.x, p.y);
          return;
        }
        boardTapRef.current = { t: now, x: p.x, y: p.y };
        schedulePaint();
        return;
      }
    }

    if (points.length < minPts) {
      schedulePaint();
      return;
    }
    boardTapRef.current = null;
    const thinned = thinStrokePoints(points, 0.003, 800);
    const finalPoints =
      thinned.length === 1
        ? [thinned[0], { ...thinned[0], x: thinned[0].x + 0.0005, y: thinned[0].y + 0.0005 }]
        : thinned;
    onStrokeComplete({
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      points: finalPoints,
      color,
      width: activeWidth,
      tool,
      userId,
      name: userName,
    });
  };

  const handleAddMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      window.alert("File is too large for the board (max 12MB).");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Read failed"));
      reader.onerror = () => reject(new Error("Read failed"));
      reader.readAsDataURL(file);
    });

    const isImage = file.type.startsWith("image/");
    const item: WhiteboardMedia = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: isImage ? "image" : "file",
      name: file.name,
      mime: file.type || "application/octet-stream",
      dataUrl,
      x: 0.12 + Math.random() * 0.15,
      y: 0.12 + Math.random() * 0.15,
      w: isImage ? 0.32 : 0.28,
      userId,
      userName,
    };
    onMediaAdd(item);
    setSelectedId(item.id);
  };

  const tryDoubleRemove = (id: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === id && now - last.time < 380) {
      lastTapRef.current = null;
      onMediaRemove(id);
      setSelectedId(null);
      return true;
    }
    lastTapRef.current = { id, time: now };
    return false;
  };

  const onMediaPointerDown = (e: React.PointerEvent, item: WhiteboardMedia) => {
    if (!canDraw) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelectedId(item.id);
    if (tryDoubleRemove(item.id)) return;
    dragRef.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
    };
  };

  const onMediaPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    onMediaMove(drag.id, drag.origX + dx, drag.origY + dy);
  };

  const onMediaPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
  };

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl border border-[#c5ddb8] bg-white/90 overflow-hidden shadow-sm">
      <div className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-2 border-b border-[#c5ddb8] bg-[#f7fbf4] overflow-x-auto scrollbar-none shrink-0">
        <span className="hidden sm:inline text-[10px] uppercase tracking-widest font-semibold text-[#5f7a62] mr-1 shrink-0">
          Shared board
        </span>
        {!canDraw ? (
          <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-[#5f7a62] bg-white border border-[#c5ddb8]">
            View only — host controls the board
          </span>
        ) : (
          <>
        <button
          type="button"
          onClick={() => setTool("pen")}
          className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            tool === "pen" ? "bg-[#4f8f28] text-white" : "bg-white text-ink border border-[#c5ddb8]"
          }`}
        >
          <Pen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pen</span>
        </button>
        <button
          type="button"
          onClick={() => setTool("eraser")}
          title="Erase specific marks"
          className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            tool === "eraser" ? "bg-[#4f8f28] text-white" : "bg-white text-ink border border-[#c5ddb8]"
          }`}
        >
          <Eraser className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Eraser</span>
        </button>
        <input
          ref={mediaInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.xls,.xlsx,.zip"
          onChange={(e) => void handleAddMedia(e)}
        />
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          title="Add image or file to the board"
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold shrink-0 bg-white text-ink border border-[#c5ddb8] hover:bg-[#e8f5e0]"
        >
          <ImagePlus className="w-3.5 h-3.5 text-[#4f8f28]" />
          <span className="sm:inline">Add</span>
        </button>
        <span
          className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold text-[#5f7a62] shrink-0"
          title="Double-tap or double-click the board to type"
        >
          <Type className="w-3.5 h-3.5 text-[#4f8f28]" />
          Double-tap to type
        </span>
        <div className="flex items-center gap-1 ml-0.5 shrink-0">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => {
                setColor(c);
                setTool("pen");
              }}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-[#c5ddb8] shadow-sm"
              style={{
                background: c,
                outline: color === c && tool === "pen" ? "2px solid #4f8f28" : "none",
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-[#5f7a62] ml-0.5 shrink-0">
          <span className="hidden sm:inline">{tool === "eraser" ? "Eraser" : "Size"}</span>
          <input
            type="range"
            min={tool === "eraser" ? 8 : 1}
            max={tool === "eraser" ? 48 : 16}
            value={activeWidth}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (tool === "eraser") setEraserWidth(v);
              else setWidth(v);
            }}
            className="w-14 sm:w-20 accent-[#4f8f28]"
          />
        </label>
        <button
          type="button"
          onClick={onClear}
          title="Clear entire board"
          className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 hover:bg-rose-100 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 touch-none overflow-hidden"
        onPointerLeave={() => setCursorPos(null)}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          style={{ cursor: canDraw ? (tool === "eraser" ? "none" : "crosshair") : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={(e) => {
            if (drawingRef.current) endStroke(e);
          }}
          onDoubleClick={(e) => {
            if (!canDraw) return;
            e.preventDefault();
            const p = normPoint(e.clientX, e.clientY);
            if (p) startTextAt(p.x, p.y);
          }}
        />

        {draft && canDraw && (
          <div
            className="absolute z-30"
            style={{
              left: draft.x * boardSize.w,
              top: draft.y * boardSize.h,
              width: Math.max(140, 0.3 * boardSize.w),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={textInputRef}
              value={draft.text}
              rows={2}
              placeholder="Type here…"
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onBlur={() => commitDraft()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(null);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              className="w-full min-h-[2.5rem] resize-none rounded-lg border-2 border-[#4f8f28] bg-white/95 px-2 py-1.5 text-sm font-semibold shadow-md outline-none"
              style={{ color }}
            />
            <p className="mt-0.5 text-[9px] text-[#5f7a62] font-medium px-0.5">
              Enter to place · Esc to cancel
            </p>
          </div>
        )}

        {media.map((item) => {
          const left = item.x * boardSize.w;
          const top = item.y * boardSize.h;
          const widthPx = Math.max(72, item.w * boardSize.w);
          const selected = selectedId === item.id;
          return (
            <div
              key={item.id}
              className={`absolute z-10 select-none touch-none ${
                selected ? "ring-2 ring-[#4f8f28] ring-offset-1" : ""
              }`}
              style={{ left, top, width: widthPx }}
              onPointerDown={(e) => onMediaPointerDown(e, item)}
              onPointerMove={onMediaPointerMove}
              onPointerUp={onMediaPointerUp}
              onPointerCancel={onMediaPointerUp}
              onDoubleClick={(e) => {
                if (!canDraw) return;
                e.preventDefault();
                e.stopPropagation();
                onMediaRemove(item.id);
                setSelectedId(null);
              }}
            >
              {canDraw && (
              <button
                type="button"
                className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow border border-white"
                title="Remove from board"
                aria-label={`Remove ${item.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onMediaRemove(item.id);
                  setSelectedId(null);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
              )}

              {item.kind === "image" ? (
                <img
                  data-board-img={item.id}
                  src={item.dataUrl}
                  alt={item.name}
                  draggable={false}
                  className="w-full h-auto rounded-lg border border-[#c5ddb8] shadow-md bg-white pointer-events-none"
                />
              ) : item.kind === "text" ? (
                <div
                  data-board-text={item.id}
                  className="rounded-lg border border-[#c5ddb8]/80 bg-white/90 px-2.5 py-2 shadow-md text-sm font-semibold whitespace-pre-wrap break-words pointer-events-none"
                  style={{ color: item.color || "#1a3324" }}
                >
                  {item.text}
                </div>
              ) : (
                <a
                  href={item.dataUrl}
                  download={item.name}
                  onClick={(e) => {
                    if (dragRef.current) e.preventDefault();
                  }}
                  className="flex items-center gap-2 rounded-lg border border-[#c5ddb8] bg-white px-2.5 py-2 shadow-md text-xs font-semibold text-ink"
                >
                  <FileText className="w-4 h-4 text-[#4f8f28] shrink-0" />
                  <span className="truncate min-w-0">{item.name}</span>
                </a>
              )}
              <p className="mt-0.5 text-[9px] text-[#5f7a62] font-medium truncate px-0.5">
                {item.userName} · double-tap to remove
              </p>
            </div>
          );
        })}

        {tool === "eraser" && cursorPos && containerRef.current && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full border-2 border-[#4f8f28]/70 bg-[#4f8f28]/10 z-20"
            style={{
              width: eraserWidth,
              height: eraserWidth,
              left:
                cursorPos.x -
                containerRef.current.getBoundingClientRect().left -
                eraserWidth / 2,
              top:
                cursorPos.y -
                containerRef.current.getBoundingClientRect().top -
                eraserWidth / 2,
            }}
          />
        )}
      </div>
    </div>
  );
});

function thinStrokePoints(
  pts: Array<{ x: number; y: number; p?: number }>,
  minDist: number,
  maxPts: number
): Array<{ x: number; y: number; p?: number }> {
  if (pts.length <= 2) return pts;
  const out: Array<{ x: number; y: number; p?: number }> = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= minDist) out.push(cur);
  }
  out.push(pts[pts.length - 1]);
  if (out.length <= maxPts) return out;
  // Evenly resample if still too many (very long strokes)
  const stepped: Array<{ x: number; y: number; p?: number }> = [];
  const step = (out.length - 1) / (maxPts - 1);
  for (let i = 0; i < maxPts; i++) {
    stepped.push(out[Math.round(i * step)]);
  }
  return stepped;
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: WhiteboardStroke,
  w: number,
  h: number
) {
  const pts = stroke.points;
  if (pts.length < 1) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }

  if (pts.length === 1) {
    const p = pts[0];
    const pressure = p.p && p.p > 0 ? p.p : 0.5;
    const r = (stroke.width * (0.55 + pressure * 0.9)) / 2;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(1, r), 0, Math.PI * 2);
    ctx.fillStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : stroke.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const pressure = p.p && p.p > 0 ? p.p : 0.5;
    ctx.lineWidth =
      stroke.tool === "eraser"
        ? stroke.width * (0.85 + pressure * 0.35)
        : stroke.width * (0.55 + pressure * 0.9);
    ctx.lineTo(p.x * w, p.y * h);
  }
  ctx.stroke();
  ctx.restore();
}
