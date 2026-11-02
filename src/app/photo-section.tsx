"use client";

// All of the bar's photos in one place, with buttons to narrow to one kind.

import { useState } from "react";
import type { BarPhoto } from "@/lib/types";
import { PhotoGallery } from "./photo-gallery";

export function PhotoSection({ groups }: { groups: { label: string; photos: BarPhoto[] }[] }) {
  const shown = groups.filter((g) => g.photos.length > 0);
  const [filter, setFilter] = useState<string | null>(null);
  const photos = filter ? shown.find((g) => g.label === filter)?.photos ?? [] : shown.flatMap((g) => g.photos);

  return (
    <>
      {shown.length > 1 && (
        <div className="chips" role="group" aria-label="Show photos of">
          {[null, ...shown.map((g) => g.label)].map((label) => (
            <button
              key={label ?? "all"}
              type="button"
              className="chip-button"
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
            >
              {label ?? "All"}
            </button>
          ))}
        </div>
      )}
      <PhotoGallery key={filter ?? "all"} photos={photos} />
    </>
  );
}
