# Weblyzer

A web audit tool for one person looking after a handful of their own sites.

It crawls each site, then splits what it found across seven tabs: Bug, Console,
Security, SEO, GEO, Audit, and Lighthouse. Runs as a small multi-user instance:
sign in to use the AI layer with your own API key, or use everything else
without an account at all.

The question its screen answers every morning: **what broke last night, and
what is already fixed?**

> The interface is in Indonesian, since that is who it was built for. The code,
> commits, and this file are in English.

## What it does

Findings are reconciled across runs by fingerprint, so each one carries a
history — `open` → `fixed` → `open` — and the tool can tell you what changed
rather than just what is wrong today.

**30 deterministic rules** across five categories:

| Category | What it looks at |
|---|---|
| Bug (6) | HTTP errors, blank pages, broken assets, load timeouts, redirect chains and loops |
| Console (4) | Uncaught exceptions, `console.error`/`warn`, failed network requests |
| Security (6) | Exposed files, directory listings, expiring TLS, mixed content, cookie flags, missing headers |
| SEO (12) | Titles, meta descriptions, h1, canonical, hreflang, noindex |
| Lighthouse (2) | Failing binary audits, and pages Lighthouse could not measure at all |

**Two AI-judged categories** via the [claude-seo](https://github.com/AgriciDaniel/claude-seo)
plugin, run through Claude Code headless: **GEO** (AI-crawler reachability,
passage citability, brand entity signals) and **Audit** (content architecture,
E-E-A-T, schema, search intent). These are judgements rather than measurements
and the UI says so.

Both are **admin-only**, and that is a security boundary rather than a
preference. They run Claude Code with `Bash`, `Task`, and `WebFetch` enabled on
the server itself, so they cannot be driven by a visitor's API key — and
letting a stranger trigger them would hand them a shell. Their tab stays
visible to everyone and says exactly that.

Everything else: Excel export with a ready-to-paste fix prompt per problem,
Lighthouse scores measured locally for both mobile and desktop, per-finding
recheck without recrawling the site, and optional AI summaries.

## Demo

A read-only demo page at `/demo` ships with the repository, backed by a bundled
`demo.db` of two real scans: Weblyzer pointed at itself, and apple.com as a
public comparison. Deployable to Vercel — the page opens its own read-only
connection and there is no write path on it. It needs `WEBLYZER_SECRET` set
like any other deploy: the app validates it at startup rather than at the first
sign-in attempt, so a misconfigured instance fails loudly instead of looking
healthy until someone tries to log in.

The full app is not deployable to a serverless host, and that is architectural
rather than a configuration gap: findings live in a local SQLite file whose
`open` → `fixed` history is the point of the tool, scans spawn a detached
process that outlives the request, and the job queue needs something long-lived
to drain it. Use the Dockerfile on a host with a volume instead.

## Who can do what

| | Guest, no account | User | Admin |
|---|---|---|---|
| Add sites | 1 | unlimited | unlimited |
| Scans per 24h | 3 | unlimited | unlimited |
| Bug / Console / Security / SEO / Lighthouse | yes | yes | yes |
| Excel export | yes | yes | yes |
| AI summaries | no | after saving an API key | after saving an API key |
| GEO / Audit | no | no | yes |

A guest is **not an account**: no sign-up, no row in any table, no session
table. What identifies one is a single signed `httpOnly` cookie, and the server
stores nothing about it beyond `sites.guest_id` on the sites it created.

That cookie exists for one reason that cannot be designed away: a scan fires at
third-party sites from this server's IP. Without a per-guest limit, a public
instance is an open crawler, and the address in the victim's logs is the
instance owner's.

## Requirements

- **Node 24+** (per `engines`; developed on 26) — uses `node:sqlite` and runs
  TypeScript directly, so the scanner has no build step and no `tsx`
- Chromium, installed by Playwright
- An Anthropic API key **per person who wants AI summaries** — each user brings
  their own, and their own bill
- Optional: the `claude` CLI on the server, for the admin-only GEO/Audit tabs

## Running it

```bash
export WEBLYZER_SECRET=$(openssl rand -hex 32)   # required
npm install
npm run dev            # http://localhost:3000
npm run seed           # creates the first admin account
```

`data.db` creates itself on first use and migrations run automatically.

**`WEBLYZER_SECRET` is required and the app refuses to start without it.** It
signs the session and guest cookies and derives the key that encrypts stored
API keys. Generate it once and keep it: losing it signs everyone out and makes
every stored API key undecryptable. There is deliberately no random fallback —
a secret generated at startup would change on every restart and lose that data
silently.

`npm run seed` is idempotent and only touches a database with no users at all.
It creates the first admin and adopts any sites that predate multi-user, which
would otherwise be invisible to everyone while their scheduled scans kept
running.

Optional, for signing in with Google. Without all three the Google button is
not rendered at all, rather than rendered and then failing:

```bash
export WEBLYZER_BASE_URL=https://weblyzer.example.com
export WEBLYZER_GOOGLE_CLIENT_ID=...
export WEBLYZER_GOOGLE_CLIENT_SECRET=...
```

Optional email for scheduled scans, from the environment rather than a
settings page:

```bash
export WEBLYZER_SMTP_URL=smtps://user:pass@smtp.example.com:465
export WEBLYZER_MAIL_FROM=weblyzer@example.com
export WEBLYZER_MAIL_TO=you@example.com
```

Mail is only sent when something failed or changed. No email means nothing
changed, **not** that the schedule ran — the dashboard's "last scanned" column
is what answers that.

Every scan also works from the terminal, and the UI calls the same CLI:

```bash
npm run scan -- add-site "Name" https://example.com
npm run scan -- scan <id> [bugs|console|security|seo]
npm run scan -- lighthouse <id>
npm run scan -- geo <id>        # via claude-seo
npm run scan -- audit <id>      # via claude-seo, takes tens of minutes
npm run scan -- jadwal          # every enabled site, for cron
```

## Docker

```bash
docker build -t weblyzer .
docker run -d -p 3000:3000 -v ~/weblyzer-data:/data weblyzer
```

`/data` must be a volume. Without it the `open` → `fixed` history is lost every
time the container is replaced, and that history is the whole point of the
tool. It is a directory rather than a file because WAL writes `data.db-wal` and
`data.db-shm` alongside it.

**AI summaries now work in a container; the GEO and Audit tabs still do not.**
Summaries go over HTTPS with the user's own API key, which a container has no
trouble with. GEO and Audit call the `claude` CLI, which needs an interactive
OAuth login — a browser and a terminal, neither of which exists in a container
— and copying host credentials into the image would put tokens in a pushable
layer. Everything else runs: the five deterministic categories, Lighthouse, the
Excel export, the scheduler, and email.

Secrets are read from the environment at run time, never baked into the image:

```bash
docker run -d -p 3000:3000 -v ~/weblyzer-data:/data \
  -e WEBLYZER_SECRET=... \
  -e WEBLYZER_SMTP_URL=smtps://user:pass@smtp.example.com:465 \
  -e WEBLYZER_MAIL_FROM=weblyzer@example.com \
  -e WEBLYZER_MAIL_TO=you@example.com \
  weblyzer
```

`WEBLYZER_SECRET` must be the **same value** across container replacements. A
new one means everyone is signed out and every stored API key can no longer be
decrypted — keep it wherever you keep the volume.

For the scheduled scan, point host cron at the running container rather than
adding a second scheduler inside it:

```
0 0 * * * docker exec weblyzer node scripts/scan.ts jadwal
```

The image is around 3.8 GB, almost all of it Chromium. Verified by building it
and running a real scan inside: dependencies present after `npm ci --omit=dev`,
Chromium launching, findings written to the volume, read back from the host,
and the web server serving them.

## Decisions worth knowing about

**Each person brings their own API key, and this reverses an earlier decision.**
The AI layer used to call CLIs already installed and signed in on the machine,
so there was no key to store — and that was right for a tool one person ran on
their own laptop. It stops being right the moment a second person uses the
instance: CLI credentials belong to the machine, so everyone would share one
Claude account with no way to tell whose usage was whose, and the owner's
subscription would quietly pay for every visitor's summaries.

So keys are now per user, AES-256-GCM encrypted in `data.db`, and validated
against Anthropic before the AI layer will touch them — a key that saves
successfully but does not work is a lie that surfaces at 3am when the scheduled
scan fails. Validation uses `GET /v1/models`, which is free and spends no
tokens.

What did **not** change: CLI credentials still belong to the machine and are
still never stored by this app. They are what the admin-only GEO and Audit tabs
use.

**"Zero credentials in `data.db`" is no longer true, and the file is not
encrypted.** It now holds scrypt password hashes and encrypted API keys. The
encryption key is derived from `WEBLYZER_SECRET`, so a stolen `data.db` alone
does not yield the keys — a stolen `data.db` *plus* the environment does. Treat
the volume and the secret as one thing.

**Sessions have no table, so there is no global sign-out.** A signed cookie is
the session. Changing a password does not revoke sessions already issued on
other devices, and there is no list of active sessions to inspect. For an
instance whose handful of users know each other that is a fair trade against a
table plus its cleanup; the account page says so rather than letting anyone
believe otherwise. The way out, if it stops being fair, is one column
(`users.sesi_epoch`, signed into the cookie and bumped on password change) —
not a table.

**Findings must be deterministic.** A checker whose answer drifts between runs
makes the `open` → `fixed` history lie — a finding that comes and goes with
nothing changing on the site marks itself fixed, and "how many are done" stops
meaning anything. This class of bug appeared four times during development. It
is why Lighthouse is measured twice and only audits that fail both times are
reported, and why the AI-judged categories live in their own tabs with their
own rules rather than mixed into the deterministic ones.

**Zero findings has three different meanings.** `not-yet-scanned`, `clean`, and
`failed` all produce zero findings and mean opposite things. An unreachable site
fails the job rather than reconciling zero findings, because the alternative
marks every existing finding as fixed.

**One browser visit, many checkers.** The crawler collects; the analyzers judge.
Analyzers are pure functions with no browser and no database, which is why they
are fully tested.

**Workers are separate processes.** Long-lived workers carry the code they
loaded at startup, so a job queued after a code change can be executed by a
worker that started before it. This happened for real.

## Tests

```bash
npm test               # 434 tests
npx tsc --noEmit       # must be clean
```

Many are deliberately proven able to fail rather than merely pass: severity
ordering, the stuck-run threshold, the no-inventing rule in AI prompts, the
non-2xx guard in the SEO analyzer, null scores staying blank in Excel, and the
guarantee that rechecking one finding does not touch the others.

The UI has eleven end-to-end tests over a dev server and its own throwaway
database, covering the write paths — server action, SQLite write,
`revalidatePath` — that unit tests never reach.

The check that matters most is still not automated: **run a scan twice without
changing anything.** If a finding moves to `fixed` and reopens, some checker is
not deterministic. For the model-judged categories a finding is only marked
fixed after two consecutive analyses miss it, for the same reason Lighthouse is
measured twice: one observation is not a basis.

## What it does not do

No keyword research, SERP data, backlinks, or rank tracking — this audits pages,
it does not do market analysis. No scheduler is installed for you (the CLI
command exists; wiring it to cron is yours).

Around 9,300 lines of source and 5,700 lines of tests. Two runtime dependencies
outside Next, React, Playwright, and Lighthouse: `write-excel-file` and
`nodemailer`.

## Status

Built for one person's own sites and shared in case the approach is useful.
There is no license file, so no rights are granted beyond viewing — open an
issue if you want to use it for something.
