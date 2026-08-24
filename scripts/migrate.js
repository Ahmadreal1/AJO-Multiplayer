#!/usr/bin/env node
/**
 * AJO schema migration runner.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate.js
 *
 * Applies server/postgres-schema.sql against the target database.
 * Does nothing (and exits non-zero) if DATABASE_URL is missing.
 * Never embeds credentials.
 */

const fs = require("fs");
const path = require("path");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. PostgreSQL is NOT CONNECTED.\n" +
        "Set DATABASE_URL and re-run to apply the schema."
    );
    process.exit(1);
  }

  let pg;
  try {
    pg = require("pg");
  } catch {
    console.error("The 'pg' package is required. Run: npm install pg");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "server", "postgres-schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(sql);
    console.log("AJO schema applied successfully.");
    console.log("Tables: rooms, players, rounds, round_objects, votes");
  } catch (e) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
