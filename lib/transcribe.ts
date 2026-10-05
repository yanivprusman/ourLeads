import "server-only";
import net from "node:net";

/**
 * Speech to text through the resident whisperd worker on this machine (the
 * same one `transcribe` and the voice stack use). There is no in-process
 * fallback to loading a model: that would take seconds per message and hide a
 * dead whisperd behind slowness.
 */
const SOCKET = process.env.WHISPERD_SOCKET || "/run/user/0/claude-voice/whisper.sock";
const TIMEOUT_MS = 300_000;

export function transcribe(file: string, lang = "he"): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = net.createConnection(SOCKET);
    sock.setTimeout(TIMEOUT_MS, () => sock.destroy(new Error("whisperd did not answer in time")));
    sock.on("connect", () => sock.write(JSON.stringify({ path: file, lang, task: "transcribe" }) + "\n"));
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      sock.end();
      try {
        const reply = JSON.parse(buf.slice(0, nl)) as { text?: string; error?: string };
        if (reply.error) reject(new Error(`whisperd: ${reply.error}`));
        else resolve((reply.text ?? "").trim());
      } catch (e) {
        reject(new Error(`whisperd sent junk: ${(e as Error).message}`));
      }
    });
    sock.on("error", (e) => reject(new Error(`whisperd unreachable at ${SOCKET}: ${e.message}`)));
  });
}
