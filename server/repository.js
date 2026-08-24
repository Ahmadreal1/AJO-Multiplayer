/**
 * AJO Repository factory
 *
 * Selection is driven by environment:
 *   AJO_REPOSITORY=json      (default)  → JSON file adapter
 *   AJO_REPOSITORY=postgres            → PostgreSQL adapter (requires DATABASE_URL)
 *
 * Secrets (DATABASE_URL, passwords) must never be committed to source.
 */

const { JsonRepository } = require("./json-repository");
const { PostgresRepository } = require("./postgres-repository");

/**
 * Create and initialize the configured repository.
 * @returns {Promise<JsonRepository|PostgresRepository>}
 */
async function createRepository(options = {}) {
  const kind = (
    options.kind ||
    process.env.AJO_REPOSITORY ||
    "json"
  ).toLowerCase();

  if (kind === "postgres") {
    const repo = new PostgresRepository({
      connectionString: options.connectionString || process.env.DATABASE_URL,
    });
    await repo.init();
    if (process.env.AJO_AUTO_MIGRATE === "1" || options.autoMigrate) {
      await repo.ensureSchema();
      console.log("PostgreSQL schema ensured (AJO_AUTO_MIGRATE=1).");
    }
    return repo;
  }

  // Default: development JSON adapter
  const repo = new JsonRepository({
    dataFile: options.dataFile,
  });
  await repo.init();
  return repo;
}

module.exports = {
  createRepository,
  JsonRepository,
  PostgresRepository,
};
