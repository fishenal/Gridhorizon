/**
 * Ensure default map row exists, then push schema.
 * Run: pnpm exec tsx scripts/ensure-default-map.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../lib/db";
import { ensureDefaultMap } from "../lib/map/world";

async function main() {
  const db = getDb();
  // If maps table doesn't exist yet, this will fail — run after maps table is created.
  try {
    const map = await ensureDefaultMap(db);
    console.log("Default map ready:", map);
  } catch (e) {
    console.error(
      "ensureDefaultMap failed (create maps table first via db:push):",
      e,
    );
    process.exit(1);
  }
}

void main();
