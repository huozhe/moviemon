const LABELS: Record<string, string> = {
  netflix: "Netflix",
  max: "Max",
  prime: "Prime",
  youtubetv: "YouTube TV",
};

const COLORS: Record<string, string> = {
  netflix: "bg-red-100 text-red-800",
  max: "bg-violet-100 text-violet-800",
  prime: "bg-sky-100 text-sky-800",
  youtubetv: "bg-rose-100 text-rose-800",
};

export function ProviderBadges({
  providerIds,
  webUrls,
}: {
  providerIds: string[];
  webUrls?: Record<string, string | null>;
}) {
  if (providerIds.length === 0) {
    return <span className="text-sm text-zinc-400">None</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {providerIds.map((id) => {
        const label = LABELS[id] ?? id;
        const href = webUrls?.[id];
        const className = `rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[id] ?? "bg-zinc-100 text-zinc-700"}`;

        if (href) {
          return (
            <li key={id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${className} underline-offset-2 hover:underline`}
              >
                {label}
              </a>
            </li>
          );
        }

        return (
          <li key={id} className={className}>
            {label}
          </li>
        );
      })}
    </ul>
  );
}
