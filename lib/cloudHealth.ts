import "server-only";
import { sendText } from "./bridge";
import { cloud, cloudConfigured, phoneNumberStatus } from "./cloud";
import { getDb, now } from "./db";

/**
 * Is the business number still on the Cloud API? Asked of Meta every hour.
 *
 * The number can leave the API without anything here noticing: someone
 * registers it in the WhatsApp app (it needs the two-step PIN, which lives only
 * in the config file), Meta disconnects it, or the token is revoked. From
 * inside, all three look the same as a quiet day — customers simply stop
 * arriving. So the answer is checked, and Yaniv hears when it changes (and only
 * then, not every hour it stays broken).
 */
const EVERY_MS = 60 * 60_000;
const log = (...a: unknown[]) => console.log("[ourleads/cloud-health]", ...a);

export async function checkCloudHealth(): Promise<void> {
  if (!cloudConfigured()) return;
  let verdict: string;
  try {
    const s = await phoneNumberStatus();
    verdict = s.platformType === "CLOUD_API" && s.status === "CONNECTED" ? "ok" : `המספר לא מחובר ל-API (platform=${s.platformType ?? "?"}, status=${s.status ?? "?"})`;
  } catch (e) {
    verdict = `אין תשובה מ-Meta על המספר: ${(e as Error).message}`;
  }
  const d = getDb();
  const prev = (d.prepare("SELECT value FROM settings WHERE key = 'cloud_health'").get() as { value: string } | undefined)?.value ?? "ok";
  d.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cloud_health', ?, ?, 'check')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(verdict, now());
  if (verdict === prev) return;
  log(verdict);
  const text =
    verdict === "ok"
      ? "✅ הקו העסקי בוואטסאפ מחובר שוב — לקוחות מגיעים ל-ourLeads."
      : `⚠️ הקו העסקי בוואטסאפ לא עובד: ${verdict}\nלקוחות שכותבים עכשיו לא מגיעים ל-ourLeads ולא מקבלים תשובה.`;
  // The line itself is down, so both groups hear it.
  for (const jid of Object.values(cloud().alertJids)) {
    try {
      await sendText(jid, text);
    } catch (e) {
      log(`alert to ${jid} failed:`, (e as Error).message);
    }
  }
}

export function startCloudHealth(): void {
  const g = globalThis as unknown as { __ourleadsCloudHealth?: NodeJS.Timeout };
  if (g.__ourleadsCloudHealth || !cloudConfigured()) return;
  g.__ourleadsCloudHealth = setInterval(() => void checkCloudHealth(), EVERY_MS);
  void checkCloudHealth();
}
