@AGENTS.md

# ourLeads

> **Dudu left on 2026-10-10.** The business line's assistant took over his part (first talk with the
> customer). What changed: he is no longer in `OURLEADS_USERS` (no login, not a ball place); the ball
> can be with the assistant (`ASSISTANT` in `lib/config.ts`, holder `"assistant"`, like the customer —
> not a user, no share); lead text goes only to the preview group; the two sources are shown under
> Yaniv's brands, "ג.ח. עבודות גובה" (`basis`) and "ג.ח. יונים וחלונות" (`israel`) — ids unchanged,
> leads carry them. **Dudu's two chats are no longer read** — the partner-chat reader and its
> extractor were removed (leads now come from the business line and customers' own chats). The
> history below describes how the board was built for the partnership.

Shared lead board for the partnership with **Dudu (בסיס עבודות בגובה, 053-332-5272, basis-s.co.il)**
and the business **סנפלינג ישראל (052-540-7778, s-israel.co.il)**. The split Dudu set on 2026-10-05:
building and facade work goes to Basis; pigeons and windows go to סנפלינג ישראל.

**"ישראל" is part of a company name, not a person** — there is no partner called Israel. Never
write "Israel said" / "ישראל אמר"; the source's `actor` in `lib/config.ts` is what events are signed with.

## How leads get in
- `instrumentation.ts` starts `lib/ingest.ts`. Every 20 s it reads both private chats from the
  leader's WhatsApp bridge (`/api/dbquery`, `/api/download`, `/api/mediafile`). It is **read-only
  and never sends**. Messages are stored as `pending` in `$OURLEADS_DATA_DIR/ourleads.sqlite`.
- A chat's batch is processed once the chat has been quiet for 2 min, or once the oldest pending
  message is 8 min old (a live conversation is never quiet). Voice notes go to whisperd. Then
  `claude -p` (`lib/claude.ts`) groups the burst into leads, using `--json-schema` structured output.
- **The extractor must see the photos** (`--tools Read --add-dir <media>`). Most leads arrive as
  screenshots of the customer's chat, with the name, the phone number in the header and the address.
  On the first run, extraction from text alone merged two different customers into one lead.
- The answer is schema-constrained because free-text JSON broke on `מע"מ`.

## Customers' own chats (2026-10-08)
`lib/customerChats.ts` also reads every private chat whose number is a phone on a lead — the
customer's own talk with Yaniv (the bridge's account; Dudu's phone is not visible). Each message
goes on that lead's history with a note line. **A status never moves from a customer's chat on its
own**: the status, with the meeting/work dates or price that come with it, is left as a
`proposal` on the lead (`lib/proposal.ts`) and moves only when one of us taps אשר
(`POST /api/leads/[id]/proposal {accept}`). Yaniv's rule: the user confirms every status change.

## Talking to it
`POST /api/command` takes either multipart `audio` (transcribed here) or JSON `{text}`.
`lib/command.ts` matches what was said to the open leads and applies status, visit, next step and
note. Each change is logged in `events` with who said it.

## Auth
`OURLEADS_USERS` in `.env.local` holds one token per partner. The phone sends it as a bearer
token, baked in from `mobile/.env`. A browser signs in with the access code, or with a link from
`node scripts/make-link.mjs <user> [minutes] [origin]` — single-use: opening it shows a button,
and the tap uses it up (a GET must not, or WhatsApp's link preview would burn it) — and then
holds an HMAC cookie. Media is
served by signed URL (`/api/media/<file>?sig=`).

The dev host sits behind the dev-auth wall, and Dudu must NOT be granted access to it: a grant
there is root on the dev box. Dudu's browser access has to go through prod.

## Dev and prod: one board, two versions (2026-10-06)
Yaniv works on dev, Dudu on prod, at the same time on the same leads. So:
- **One data dir.** Both `.env.local` files set `OURLEADS_DATA_DIR=/opt/automateLinux/data/ourLeads/shared`
  (SQLite in WAL mode, both servers on the desktop). Dev code writes the board Dudu sees.
- **One reader.** `OURLEADS_INGEST=on` on exactly one server (prod normally), `off` on the other.
  Flip it by hand to test extraction on dev — never two "on". The reader also writes the daily
  backup to `shared/backups/` (14 kept).
- **Prod follows every commit.** `core.hooksPath=.githooks`; `post-commit` starts
  `scripts/auto-deploy-prod.sh` as its own systemd unit (`journalctl -u 'ourleads-autodeploy-*'`).
  So prod is minutes behind dev, and a schema change reaches prod with the commit that makes it —
  but a half-written migration in *uncommitted* dev code still runs against the shared DB.

## The business line and its assistant (2026-10-09)
Yaniv is replacing Dudu's part (first talk with the customer, collecting the job) with an assistant on his
own business number, on Meta's **WhatsApp Cloud API** — no phone behind it.
- `lib/cloud.ts`: config from `OURLEADS_WA_CLOUD_CONFIG` (JSON, mode 600: `phone_number_id, access_token,
  app_secret, verify_token, graph_version, alert_jid_pigeons_windows, alert_jid_building`, plus `pin`). Unset = line not set up: the webhook answers 503 and
  nothing is read. Customers are filed under `<waId>@business`, never `@s.whatsapp.net` (that is the
  personal number's chat with the same person).
- `app/api/whatsapp/route.ts`: Meta's webhook, on prod (public). GET = Meta's verify; POST is checked against
  `X-Hub-Signature-256` and only stores messages — the ingest loop reads them (`lib/assistant.ts`).
- **Busy mode** (`settings.assistant_busy`, header switch, `POST /api/assistant {busy}`): on = the assistant
  answers, saying it is Yaniv's assistant and he is on a job; off = silent. No timer — it stays as set.
- **Rules (Yaniv's)**: not a customer → nothing at all (no reply, no lead, no flag). Never a price, estimate or
  date: a reply naming money is held back (`hasPrice`) and left on the lead. Prices go out only by hand
  (`POST /api/leads/[id]/reply`, the reply box on the lead), inside Meta's 24-hour window.
- Every batch alerts Yaniv through the personal bridge, with a `/?lead=<id>` link, in one of two groups only he is in —
  "ג.ח. פרוייקטים – יונים וחלונות" or "ג.ח. פרוייקטים – עבודות גובה" — by the lead's `line` (the assistant classifies it;
  unclear = building). Customers never see the groups; they all write to the one business number.
- **Pure API, chosen 2026-10-09** (not coexistence): the secondary number lives on Meta only, no phone. The two-step
  `pin` set at registration is kept ONLY in the config file — whoever has it can register the number in a WhatsApp app,
  which takes it off the API (and moving back is slow). `lib/cloudHealth.ts` asks Meta hourly and alerts on a change.
- Test it without the live board or a real send: copy the DB to a scratch dir, mock `fetch`, and run the lib
  with `npx tsx --conditions=react-server` (the `server-only` import needs that condition).

## Testing
Never test commands that name real leads against the live board: they change real leads.
To re-run extraction, clear `leads` and `events`, set `messages.state='pending'`, and restart
the service.
