"use client";

// A row of photos that opens full screen when tapped. Inside, swipe (or use the
// arrow keys and buttons) to move between photos; Escape or the close button exits.

import { useEffect, useRef, useState } from "react";
import type { BarPhoto } from "@/lib/types";

export function PhotoGallery({ photos }: { photos: BarPhoto[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  function show(index: number, behavior: ScrollBehavior = "smooth") {
    const el = strip.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(photos.length - 1, index));
    el.scrollTo({ left: clamped * el.clientWidth, behavior });
  }

  function open(index: number) {
    setCurrent(index);
    dialog.current?.showModal();
    // Jump without animating so the tapped photo is the first thing seen.
    requestAnimationFrame(() => show(index, "instant"));
  }

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onScroll = () => setCurrent(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") show(current + 1);
    if (event.key === "ArrowLeft") show(current - 1);
  }

  return (
    <>
      <ul className="photos">
        {photos.map((photo, i) => (
          <li key={photo.src}>
            <button type="button" className="photo-open" onClick={() => open(i)} aria-label={`View larger: ${photo.alt}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt={photo.alt} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={dialog} className="lightbox" aria-label="Photos" onKeyDown={onKeyDown}>
        <div ref={strip} className="lightbox-strip">
          {photos.map((photo) => (
            <figure key={photo.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt={photo.alt} loading="lazy" />
            </figure>
          ))}
        </div>
        <div className="lightbox-bar">
          <button type="button" onClick={() => show(current - 1)} disabled={current === 0} aria-label="Previous photo">‹</button>
          <span aria-live="polite">{current + 1} / {photos.length}</span>
          <button type="button" onClick={() => show(current + 1)} disabled={current === photos.length - 1} aria-label="Next photo">›</button>
        </div>
        <button type="button" className="lightbox-close" onClick={() => dialog.current?.close()} aria-label="Close">×</button>
      </dialog>
    </>
  );
}
