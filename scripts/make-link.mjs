#!/usr/bin/env node
/**
 * Print a link that signs a browser in to outLeads as one partner.
 *
 *   node scripts/make-link.mjs yaniv                        # 10 minutes, this machine's dev port
 *   node scripts/make-link.mjs dudu 1440 https://outleads.prod.ya-niv.com
 *
 * The link carries a signature over the partner id and its own expiry — not
 * the partner's token — so it is safe to send over WhatsApp, and worthless once
 * the minutes are up. The browser that opens it keeps a session for a year.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`make-link: ${m}`);
  process.exit(1);
};

const [user, minutesArg, origin = "http://localhost:3177"] = process.argv.slice(2);
if (!user) fail("usage: make-link.mjs <user> [minutes] [origin]");
const minutes = Number(minutesArg ?? 10);
if (!(minutes > 0)) fail(`bad minutes: ${minutesArg}`);

const env = readFileSync(path.join(appDir, ".env.local"), "utf8");
const line = env.split("\n").find((l) => l.startsWith("OUTLEADS_USERS="));
if (!line) fail("OUTLEADS_USERS is not set in .env.local");
const users = JSON.parse(line.slice("OUTLEADS_USERS=".length));
const u = users[user];
if (!u?.token) fail(`no user "${user}" (have: ${Object.keys(users).join(", ")})`);

const exp = Math.floor(Date.now() / 1000) + Math.round(minutes * 60);
const sig = createHmac("sha256", u.token).update(`outleads-web-link-v1:${exp}`).digest("hex");
console.log(`${origin.replace(/\/$/, "")}/api/session/link?u=${encodeURIComponent(user)}&exp=${exp}&sig=${sig}`);
