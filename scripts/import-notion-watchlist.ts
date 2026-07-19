/**
 * Import "Want to Watch" from bootstrap/notion_watchlist.md into MovieMon.
 *
 *   npm run import:notion
 *   # or: npx tsx --env-file=.env.local scripts/import-notion-watchlist.ts
 *
 * Additive only — does not remove existing list items.
 * Skips the ## Watched section.
 */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { addTitleToWatchlist } from "../lib/watchlist/manage";

config({ path: ".env.local" });
config({ path: ".env" });

const DEFAULT_PATH = resolve(process.cwd(), "bootstrap/notion_watchlist.md");

async function main() {
  const path = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_PATH;
  console.log(`Reading ${path}`);

  const md = readFileSync(path, "utf8");
  // Only "Want to Watch" (before ## Watched)
  const want = md.split(/^## Watched\s*$/m)[0] ?? md;
  const ids = [...want.matchAll(/tt\d{7,}/g)].map((m) => m[0]);
  const unique = [...new Set(ids)];
  console.log(`Want to Watch: ${unique.length} unique IMDb ids`);

  if (unique.length === 0) {
    console.error("No IMDb ids found in Want to Watch section");
    process.exit(1);
  }

  let added = 0;
  let already = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < unique.length; i++) {
    const id = unique[i];
    process.stdout.write(`[${i + 1}/${unique.length}] ${id} ... `);
    try {
      const r = await addTitleToWatchlist(id);
      if (r.status === "ok") {
        if (r.alreadyOnList) {
          already += 1;
          console.log(`already: ${r.name}`);
        } else {
          added += 1;
          console.log(`added: ${r.name}`);
        }
      } else {
        failed += 1;
        errors.push(`${id}: ${r.error}`);
        console.log(`ERR: ${r.error}`);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${id}: ${msg}`);
      console.log(`ERR: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log("\n=== Summary ===");
  console.log({ total: unique.length, added, already, failed });
  if (errors.length) {
    console.log("Errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
