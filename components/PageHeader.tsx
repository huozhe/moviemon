export function PageHeader({
  eyebrow,
  title,
  description,
  count,
  countLabel,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
}) {
  return (
    <div className="mb-6 border-b border-border pb-5">
      {eyebrow ? (
        <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {typeof count === "number" ? (
          <div className="rounded-xl bg-raised px-3.5 py-2 text-right ring-1 ring-border">
            <p className="font-display text-2xl font-bold tabular-nums leading-none text-accent">
              {count}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-faint">
              {countLabel ?? "titles"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
