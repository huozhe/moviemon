const LABELS: Record<string, string> = {
  netflix: "Netflix",
  max: "Max",
  prime: "Prime",
  youtubetv: "YouTube TV",
};

const STYLES: Record<string, string> = {
  netflix:
    "bg-[rgba(229,9,20,0.15)] text-[#ff6b73] ring-[rgba(229,9,20,0.35)] hover:bg-[rgba(229,9,20,0.25)]",
  max: "bg-[rgba(183,148,246,0.14)] text-[#d4c0ff] ring-[rgba(183,148,246,0.35)] hover:bg-[rgba(183,148,246,0.22)]",
  prime:
    "bg-[rgba(77,184,232,0.14)] text-[#8fd4f5] ring-[rgba(77,184,232,0.35)] hover:bg-[rgba(77,184,232,0.22)]",
  youtubetv:
    "bg-[rgba(255,92,106,0.14)] text-[#ff9aa3] ring-[rgba(255,92,106,0.35)] hover:bg-[rgba(255,92,106,0.22)]",
};

export function ProviderBadges({
  providerIds,
  webUrls,
  size = "md",
}: {
  providerIds: string[];
  webUrls?: Record<string, string | null>;
  size?: "sm" | "md";
}) {
  if (providerIds.length === 0) {
    return (
      <span className="text-xs text-faint">No services</span>
    );
  }

  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <ul className="flex flex-wrap gap-1.5">
      {providerIds.map((id) => {
        const label = LABELS[id] ?? id;
        const href = webUrls?.[id];
        const className = `inline-flex items-center rounded-full font-semibold ring-1 transition ${pad} ${STYLES[id] ?? "bg-raised text-muted ring-border"}`;

        if (href) {
          return (
            <li key={id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${className} focus-visible:outline-offset-2`}
                title={`Open on ${label}`}
              >
                {label}
                <span aria-hidden className="ml-1 opacity-60">
                  ↗
                </span>
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

export { LABELS as PROVIDER_LABELS };
