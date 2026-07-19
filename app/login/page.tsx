import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : "/";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-8 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft ring-1 ring-accent/30"
        >
          <span className="font-display text-lg font-bold text-accent">M</span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          MovieMon
        </h1>
        <p className="mt-2 text-sm text-muted">
          Enter the site password to open your watchlist.
        </p>
      </div>

      <div className="rounded-2xl bg-raised p-5 ring-1 ring-border">
        <LoginForm nextPath={next} />
      </div>
    </main>
  );
}
