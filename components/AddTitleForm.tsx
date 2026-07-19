"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AddTitleForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imdbId: value.trim() }),
      });
      const data = (await res.json()) as {
        status?: string;
        name?: string;
        imdbId?: string;
        alreadyOnList?: boolean;
        error?: string;
      };
      if (!res.ok || data.status === "error") {
        setError(data.error ?? `Add failed (${res.status})`);
        setBusy(false);
        return;
      }
      setMessage(
        data.alreadyOnList
          ? `“${data.name}” is already on your list.`
          : `Added “${data.name}” (${data.imdbId}). Availability will refresh on the next sync.`,
      );
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">
          IMDb id or title URL
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="tt0133093 or https://www.imdb.com/title/tt0133093/"
          className="w-full rounded-xl border-0 bg-void px-3.5 py-2.5 font-mono text-sm text-ink ring-1 ring-border placeholder:text-faint focus:ring-2 focus:ring-accent"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-void disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add to watchlist"}
      </button>
      {message ? (
        <p className="text-sm text-ok" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
