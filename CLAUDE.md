@AGENTS.md

# ourLeads

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

## Talking to it
`POST /api/command` takes either multipart `audio` (transcribed here) or JSON `{text}`.
`lib/command.ts` matches what was said to the open leads and applies status, visit, next step and
note. Each change is logged in `events` with who said it.

## Auth
`OURLEADS_USERS` in `.env.local` holds one token per partner. The phone sends it as a bearer
token, baked in from `mobile/.env`. A browser signs in with the access code, or with a link from
`node scripts/make-link.mjs <user> [minutes] [origin]`, and then holds an HMAC cookie. Media is
served by signed URL (`/api/media/<file>?sig=`).

The dev host sits behind the dev-auth wall, and Dudu must NOT be granted access to it: a grant
there is root on the dev box. Dudu's browser access has to go through prod, with its own
`.env.local` and data dir.

## Testing
Never test commands that name real leads against the live board: they change real leads.
To re-run extraction, clear `leads` and `events`, set `messages.state='pending'`, and restart
the service.
