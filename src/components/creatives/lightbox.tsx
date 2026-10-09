"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface LightboxItem {
  id: string;
  url: string;
  label: string;
}

/**
 * Full-screen image viewer: pinch/double-tap/wheel zoom, drag to pan when zoomed,
 * swipe (or arrow keys / buttons) between versions when not zoomed.
 */
export function Lightbox({
  items,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  items: LightboxItem[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (i: number) => void;
}) {
  const item = items[index];
  const ref = useRef<ReactZoomPanPinchRef>(null);
  const [scale, setScale] = useState(1);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (d: number) => {
    const next = index + d;
    if (next < 0 || next >= items.length) return;
    ref.current?.resetTransform(0);
    onIndexChange(next);
  };

  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92dvh] max-w-[100vw] gap-0 overflow-hidden bg-black/95 p-0 sm:max-w-5xl" showCloseButton>
        <DialogTitle className="sr-only">{item.label} preview</DialogTitle>
        <div
          className="relative flex h-full w-full touch-none items-center justify-center"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
          onTouchStart={(e) => {
            touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start || scale > 1.05) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          <TransformWrapper ref={ref} minScale={1} maxScale={6} doubleClick={{ mode: "toggle", step: 2 }} onTransform={(_, s) => setScale(s.scale)}>
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.label} draggable={false} className="max-h-full max-w-full select-none object-contain" />
            </TransformComponent>
          </TransformWrapper>

          {items.length > 1 && (
            <>
              <button type="button" aria-label="Previous version" disabled={index === 0} onClick={() => go(-1)} className="absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30">
                <ChevronLeft />
              </button>
              <button type="button" aria-label="Next version" disabled={index === items.length - 1} onClick={() => go(1)} className="absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30">
                <ChevronRight />
              </button>
            </>
          )}
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-white">
            <button type="button" aria-label="Zoom out" onClick={() => ref.current?.zoomOut()} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15"><Minus className="size-4" /></button>
            <span className="min-w-24 rounded-full bg-white/15 px-3 py-2 text-center text-xs">{item.label} · {Math.round(scale * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => ref.current?.zoomIn()} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15"><Plus className="size-4" /></button>
            <button type="button" aria-label="Reset zoom" onClick={() => ref.current?.resetTransform()} className="inline-flex size-11 items-center justify-center rounded-full bg-white/15"><RotateCcw className="size-4" /></button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
