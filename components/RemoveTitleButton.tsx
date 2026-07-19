"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveTitleButton({
  imdbId,
  name,
}: {
  imdbId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove() {
    if (busy) return;
    const ok = window.confirm(
      `Remove “${name}” from your MovieMon watchlist?\n\nThis does not change IMDb. You can re-add later by id.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imdbId }),
      });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) {
        setError(data.error ?? `Remove failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        className="rounded-lg px-2 py-1 text-[11px] font-medium text-faint ring-1 ring-border hover:bg-danger/10 hover:text-danger hover:ring-danger/30 disabled:opacity-50"
        title="Remove from MovieMon watchlist"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {error ? (
        <span className="max-w-[12rem] text-right text-[10px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
