// One-off: drop every app-owned table in the dev DB so the migration
// flow can claim ownership cleanly. Use after switching from
// `drizzle-kit push` to `drizzle-kit migrate` on a database that was
// originally populated via push.
//
// Run once: `pnpm --filter @workspace/scripts run reset-dev-db`,
// then `pnpm --filter @workspace/db run migrate` to recreate the
// schema through the baseline migration.
import pg from "pg";

const url = process.env["DATABASE_URL"];
if (!url) {
  throw new Error("DATABASE_URL must be set (load via --env-file=../../.env).");
}

const TABLES = [
  "sessions",
  "notes",
  "patients",
  "users",
] as const;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const t of TABLES) {
    console.log(`Dropping ${t}…`);
    await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
  }
  // Drop drizzle's bookkeeping schema so the next migrate run starts fresh.
  console.log("Dropping drizzle migrations bookkeeping…");
  await client.query(`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  console.log("Done. Run `pnpm --filter @workspace/db run migrate` next.");
} finally {
  await client.end();
}
