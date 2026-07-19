import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { getDb } from "../lib/db";
import { providers } from "../lib/db/schema";
import { PROVIDER_SEEDS } from "../lib/availability/providers";

async function main() {
  const db = getDb();

  for (const p of PROVIDER_SEEDS) {
    await db
      .insert(providers)
      .values({
        id: p.id,
        name: p.name,
        externalId: p.externalId,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: providers.id,
        set: {
          name: p.name,
          // preserve existing externalId / enabled if already set
        },
      });
    console.log(`seeded provider: ${p.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
