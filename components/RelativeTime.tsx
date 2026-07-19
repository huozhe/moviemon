"use client";

/**
 * Renders relative time in the user's locale/timezone.
 * Pass ISO string from the server to avoid UTC vs local mismatch.
 */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  if (!iso) return <span className={className}>—</span>;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return <span className={className}>{iso}</span>;
  }

  const absolute = d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <time dateTime={iso} title={absolute} className={className}>
      {formatRelative(d)}
    </time>
  );
}

function formatRelative(d: Date): string {
  const sec = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(sec);

  if (abs < 60) return rtf.format(sec, "second");
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 48) return rtf.format(hr, "hour");
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(day, "day");
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(month, "month");
  return rtf.format(Math.round(month / 12), "year");
}
