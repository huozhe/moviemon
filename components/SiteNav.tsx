import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth/session";
import { LogoutButton } from "./LogoutButton";

const links = [
  { href: "/", label: "Available", short: "Now" },
  { href: "/unavailable", label: "Unavailable", short: "Later" },
  { href: "/settings", label: "Settings", short: "Setup" },
] as const;

export function SiteNav({
  current,
  counts,
}: {
  current: string;
  counts?: { available?: number; unavailable?: number; pending?: number };
}) {
  const showLogout = isAuthEnabled();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft ring-1 ring-accent/30"
          >
            <span className="font-display text-sm font-bold leading-none text-accent">
              M
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-display text-base font-bold tracking-tight text-ink group-hover:text-accent">
              MovieMon
            </span>
            <span className="hidden text-[11px] text-faint sm:block">
              Your list · US streams
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav
            aria-label="Primary"
            className="flex items-center gap-0.5 rounded-xl bg-raised p-1 ring-1 ring-border"
          >
            {links.map((l) => {
              const active = current === l.href;
              const count =
                l.href === "/"
                  ? counts?.available
                  : l.href === "/unavailable"
                    ? counts?.unavailable
                    : undefined;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-void sm:px-3 sm:text-sm"
                      : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-ink sm:px-3 sm:text-sm"
                  }
                >
                  <span className="sm:hidden">{l.short}</span>
                  <span className="hidden sm:inline">{l.label}</span>
                  {typeof count === "number" ? (
                    <span
                      className={
                        active
                          ? "ml-1.5 tabular-nums opacity-80"
                          : "ml-1.5 tabular-nums text-faint"
                      }
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          {showLogout ? <LogoutButton /> : null}
        </div>
      </div>
      {typeof counts?.pending === "number" && counts.pending > 0 ? (
        <div className="border-t border-border/60 bg-accent-soft px-4 py-1.5 text-center text-[11px] text-accent sm:text-xs">
          {counts.pending} title{counts.pending === 1 ? "" : "s"} still
          checking availability
        </div>
      ) : null}
    </header>
  );
}
