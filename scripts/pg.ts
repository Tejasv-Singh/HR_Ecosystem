/**
 * Local development Postgres.
 *
 * This project targets PostgreSQL (see DECISIONS.md). Rather than requiring a
 * Docker daemon or a system-wide install, we drive the real Postgres binaries
 * shipped by `embedded-postgres` with `pg_ctl`, so the server runs as a proper
 * background daemon that outlives this script.
 *
 *   npm run db:start   -> initdb (first run) + start + ensure database exists
 *   npm run db:stop    -> fast shutdown
 *   npm run db:status  -> is it up?
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, ".pgdata");
const LOG_FILE = path.join(DATA_DIR, "postgres.log");
const EXT = process.platform === "win32" ? ".exe" : "";

const DEFAULTS = { host: "127.0.0.1", port: 5433, user: "postgres", password: "postgres", database: "hr_ecosystem" };

/** Parse DATABASE_URL so the cluster we create always matches what Prisma connects to. */
function connectionSettings() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return DEFAULTS;
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || DEFAULTS.host,
      port: Number(url.port) || DEFAULTS.port,
      user: decodeURIComponent(url.username) || DEFAULTS.user,
      password: decodeURIComponent(url.password) || DEFAULTS.password,
      database: url.pathname.replace(/^\//, "") || DEFAULTS.database,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Locate the Postgres binaries vendored by the platform-specific optional dependency. */
function binDir(): string {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch;
  const candidates = [`@embedded-postgres/${platform}-${arch}`, `@embedded-postgres/${process.platform}-${process.arch}`];

  for (const pkg of candidates) {
    try {
      const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "native", "bin");
      if (existsSync(path.join(dir, `pg_ctl${EXT}`))) return dir;
    } catch {
      // try the next candidate
    }
  }

  // Fall back to scanning, so a renamed platform package still works.
  const scope = path.join(ROOT, "node_modules", "@embedded-postgres");
  if (existsSync(scope)) {
    for (const entry of readdirSync(scope)) {
      const dir = path.join(scope, entry, "native", "bin");
      if (existsSync(path.join(dir, `pg_ctl${EXT}`))) return dir;
    }
  }

  throw new Error(
    "Could not find the bundled Postgres binaries. Run `npm install` to restore the `@embedded-postgres/*` platform package.",
  );
}

/**
 * Note: stdio is piped rather than inherited on purpose. `pg_ctl start` leaves a
 * detached postgres daemon behind, and an inherited stdout handle would be held
 * open by that daemon forever — which hangs any shell that pipes this script's
 * output.
 */
function run(bin: string, args: string[]) {
  const result = spawnSync(path.join(binDir(), `${bin}${EXT}`), args, { stdio: "pipe", encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  return result.status ?? 1;
}

function isRunning() {
  const result = spawnSync(path.join(binDir(), `pg_ctl${EXT}`), ["-D", DATA_DIR, "status"], { encoding: "utf8" });
  return result.status === 0;
}

function initialise(cfg: ReturnType<typeof connectionSettings>) {
  if (existsSync(path.join(DATA_DIR, "PG_VERSION"))) return;

  console.log("Initialising a new Postgres cluster in .pgdata ...");
  mkdirSync(DATA_DIR, { recursive: true });
  const pwFile = path.join(ROOT, ".pgpass.tmp");
  writeFileSync(pwFile, cfg.password, "utf8");
  try {
    const status = run("initdb", [
      "-D",
      DATA_DIR,
      `--username=${cfg.user}`,
      `--pwfile=${pwFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--no-sync",
    ]);
    if (status !== 0) throw new Error(`initdb exited with code ${status}`);
  } finally {
    rmSync(pwFile, { force: true });
  }
}

/** `CREATE DATABASE` is not idempotent, so check the catalog first. */
async function ensureDatabase(cfg: ReturnType<typeof connectionSettings>) {
  const client = new pg.Client({ ...cfg, database: "postgres" });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.database]);
    if (rowCount === 0) {
      // Database names cannot be parameterised; the value comes from our own DATABASE_URL.
      await client.query(`CREATE DATABASE "${cfg.database.replace(/"/g, '""')}"`);
      console.log(`Created database "${cfg.database}".`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  const cfg = connectionSettings();
  initialise(cfg);

  if (isRunning()) {
    console.log(`Postgres is already running on port ${cfg.port}.`);
  } else {
    const status = run("pg_ctl", ["-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${cfg.port}`, "-w", "start"]);
    if (status !== 0) throw new Error(`pg_ctl start exited with code ${status}. See ${LOG_FILE}`);
  }

  await ensureDatabase(cfg);
  console.log(`Postgres ready at postgresql://${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
}

function stop() {
  if (!isRunning()) {
    console.log("Postgres is not running.");
    return;
  }
  const status = run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
  if (status !== 0) throw new Error(`pg_ctl stop exited with code ${status}`);
}

const command = process.argv[2] ?? "start";

try {
  if (command === "start") await start();
  else if (command === "stop") stop();
  else if (command === "status") console.log(isRunning() ? "running" : "stopped");
  else {
    console.error(`Unknown command "${command}". Use start, stop or status.`);
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
