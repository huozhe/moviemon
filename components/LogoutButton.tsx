"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className="rounded-lg px-2 py-1 text-[11px] font-medium text-faint ring-1 ring-border hover:bg-surface hover:text-ink disabled:opacity-50 sm:px-2.5 sm:text-xs"
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}
