/**
 * Start reading the WhatsApp chats when the server starts — once per server
 * process, in the Node runtime only. (The condition must wrap the import
 * inline so the edge build drops it.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startIngest } = await import("./lib/ingest");
    startIngest();
  }
}
