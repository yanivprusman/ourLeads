import "server-only";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./config";
import { getDb } from "./db";

/**
 * A daily copy of the board. Dev and prod write the same database, and dev runs
 * code that is still being written — a bad migration or a bad bulk update there
 * lands on the board Dudu works from. Run by the reading server only, so it
 * happens once. VACUUM INTO is a consistent snapshot even while the other server
 * is writing.
 */
const KEEP = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function backupNow(): string {
  const dir = path.join(dataDir(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ourleads-${new Date().toISOString().slice(0, 10)}.sqlite`);
  rmSync(file, { force: true }); // VACUUM INTO refuses an existing file; today's copy is replaced
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = readdirSync(dir).filter((f) => /^ourleads-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) rmSync(path.join(dir, f));
  return file;
}

export function startBackups(): void {
  const g = globalThis as unknown as { __ourleadsBackup?: NodeJS.Timeout };
  if (g.__ourleadsBackup) return;
  const run = () => {
    try {
      console.log("[ourleads/backup]", backupNow());
    } catch (e) {
      console.error("[ourleads/backup] failed:", (e as Error).message);
    }
  };
  g.__ourleadsBackup = setInterval(run, DAY_MS);
  run();
}
