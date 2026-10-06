"use client";
import { useEffect, useState } from "react";

/** The lead's photos in a strip; tap one to see it whole. */
export default function Photos({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div className="flex gap-1 overflow-x-auto no-scrollbar snap-x h-60">
        {photos.map((src) => (
          <button key={src} data-id="card-photo" onClick={() => setOpen(src)} className="snap-start shrink-0 h-full cursor-zoom-in hover:opacity-90 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-auto max-w-none object-cover" />
          </button>
        ))}
      </div>
      {open && (
        <button data-id="card-photo-close" className="fixed inset-0 z-50 bg-black/90 cursor-zoom-out" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" className="h-full w-full object-contain" />
        </button>
      )}
    </>
  );
}
