# MovieMon

Public Next.js site that shows which titles on a public IMDb watchlist are available on Max, Netflix, Prime Video, and YouTube TV (US).

## Status

Early scaffolding. Design for v1 is in [`docs/plans/watchlist-streaming-availability-v1.md`](docs/plans/watchlist-streaming-availability-v1.md).

## Stack (planned)

- Next.js (App Router) + TypeScript + Tailwind
- Neon Postgres (Vercel Marketplace) + Drizzle
- Vercel Cron for daily watchlist / availability sync
- Watchmode (or equivalent) for streaming availability by IMDb ID

## License

Private for now.
