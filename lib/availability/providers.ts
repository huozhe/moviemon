/** App-level provider ids. Seed these into the `providers` table. */
export const PROVIDER_SEEDS = [
  { id: "netflix", name: "Netflix", externalId: null as string | null },
  { id: "max", name: "Max", externalId: null },
  { id: "prime", name: "Prime Video", externalId: null },
  { id: "youtubetv", name: "YouTube TV", externalId: null },
] as const;

export type ProviderId = (typeof PROVIDER_SEEDS)[number]["id"];

/** Subscription-ish monotypes count as "available now" (not rent/buy). */
export const AVAILABLE_MONOTYPES = ["flatrate", "free", "ads"] as const;

export type AvailableMonotype = (typeof AVAILABLE_MONOTYPES)[number];

export function isAvailableMonotype(monotype: string): boolean {
  return (AVAILABLE_MONOTYPES as readonly string[]).includes(monotype);
}
