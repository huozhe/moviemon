import Link from "next/link";

const links = [
  { href: "/", label: "Available" },
  { href: "/unavailable", label: "Unavailable" },
  { href: "/settings", label: "Settings" },
] as const;

export function SiteNav({ current }: { current: string }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MovieMon
        </Link>
        <nav className="flex gap-1 text-sm">
          {links.map((l) => {
            const active = current === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  active
                    ? "rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white"
                    : "rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
