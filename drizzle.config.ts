import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses .env.local; drizzle-kit does not load it by default.
config({ path: ".env.local" });
config({ path: ".env" }); // fallback / shared

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Set it in .env.local (or .env), then re-run.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
