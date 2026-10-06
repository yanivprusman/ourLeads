/**
 * Start reading the WhatsApp chats when the server starts — once per server
 * process, in the Node runtime only, and only on the server whose
 * OURLEADS_INGEST is "on" (dev and prod share one board; see config.ts).
 * The reader also takes the daily backup. (The condition must wrap the import
 * inline so the edge build drops it.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ingestEnabled } = await import("./lib/config");
    if (!ingestEnabled()) {
      console.log("[ourleads/ingest] OURLEADS_INGEST=off — this server does not read WhatsApp");
      return;
    }
    const { startIngest } = await import("./lib/ingest");
    const { startBackups } = await import("./lib/backup");
    startIngest();
    startBackups();
  }
}
