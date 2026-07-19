"use client";

import { useState } from "react";

/** One-line plot with expand/collapse for the full text. */
export function PlotExpand({ plot }: { plot: string }) {
  const [open, setOpen] = useState(false);
  const text = plot.trim();
  if (!text) return null;

  return (
    <div className="mt-1.5">
      <p
        className={
          open
            ? "text-xs leading-relaxed text-muted"
            : "line-clamp-1 text-xs leading-relaxed text-muted"
        }
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-0.5 text-[11px] font-medium text-accent hover:underline"
        aria-expanded={open}
      >
        {open ? "Show less" : "More"}
      </button>
    </div>
  );
}
