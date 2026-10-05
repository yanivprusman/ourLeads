import "server-only";
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * Ask Claude for a JSON answer through the Claude Code CLI — this machine signs
 * in with the subscription and holds no API key.
 *
 * `--tools Read` is the whole toolset — it can look at the photos in `readDir`
 * (Dudu's leads are mostly screenshots of a customer's chat) and nothing else:
 * no shell, no web, no writes. An empty strict MCP config keeps the project's
 * servers (whatsapp, court) from starting,
 * and `--setting-sources ''` keeps hooks and personal instructions out. It runs
 * from a directory outside every repo so no CLAUDE.md is collected. The prompt
 * goes in on stdin: it carries other people's words, and an argv is a place
 * where words get interpreted.
 */
const WORK_DIR = "/var/tmp/outleads-claude";
const CLAUDE_BIN = "/root/.local/bin/claude";
const MODEL = process.env.OUTLEADS_MODEL || "sonnet";
const TIMEOUT_MS = 480_000;

export async function askJson<T>(prompt: string, readDir?: string): Promise<T> {
  mkdirSync(WORK_DIR, { recursive: true });
  const raw = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      CLAUDE_BIN,
      [
        "-p",
        "--model", MODEL,
        "--tools", readDir ? "Read" : "",
        ...(readDir ? ["--allowedTools", "Read", "--add-dir", readDir] : []),
        "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
        "--setting-sources", "",
      ],
      {
        cwd: WORK_DIR,
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
        // BASH_ENV defines a `claude` wrapper that re-launches claude; inherited
        // into a child that IS claude, it forks forever.
        env: { ...process.env, BASH_ENV: undefined },
      },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean };
          if (e.killed) return reject(new Error("Claude did not answer in time"));
          return reject(new Error((stderr || err.message || "").trim() || "Claude failed"));
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(prompt, "utf8");
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`Claude did not return JSON: ${raw.trim().slice(0, 200)}`);
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    throw new Error(`Claude returned broken JSON: ${raw.trim().slice(0, 200)}`);
  }
}
