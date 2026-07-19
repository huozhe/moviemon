# Bootstrap exports

Local dumps used for **one-time** list imports. MovieMon/Neon is the ongoing source of truth — do not re-import routinely.

| File | Source | Import |
|------|--------|--------|
| `notion_watchlist.md` | Notion “Movie List” markdown export | `npm run import:notion` |
| `imdb_watchlist.csv` | IMDb watchlist → ⋯ → Export | `POST /api/sync` with `csvText`, or `IMDB_WATCHLIST_CSV_URL` |

Export files under this directory are **gitignored** (personal list data). Keep this README.

### Notion import

```bash
# place export at bootstrap/notion_watchlist.md
npm run import:notion
```

Imports only the **Want to Watch** section (skips **Watched**). Additive; never removes titles.
