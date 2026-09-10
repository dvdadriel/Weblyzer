# Weblyzer

A web audit tool for one person looking after a handful of their own sites.

It crawls each site, then splits what it found across seven tabs: Bug, Console,
Security, SEO, GEO, Audit, and Lighthouse. It runs on your own machine: no
accounts, no sign-in, and the AI model is configured in `.env` from the same
terminal you start it in.

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
connection and there is no write path on it, and it needs no environment
variables at all.

The full app is not deployable to a serverless host, and that is architectural
rather than a configuration gap: findings live in a local SQLite file whose
`open` → `fixed` history is the point of the tool, scans spawn a detached
process that outlives the request, and the job queue needs something long-lived
to drain it. Use the Dockerfile on a host with a volume instead.

## Configuring the AI model

The AI layer is optional. Without it every scan still runs in full; only the
summary is off.

Copy `.env.example` to `.env` and pick one path:

| `WEBLYZER_AI` | What it uses | Needs a key |
|---|---|---|
| `anthropic` | Messages API | yes |
| `nim`, `groq`, `openrouter`, `together`, `openai` | that provider's OpenAI-compatible endpoint | yes |
| `ollama`, `vllm`, any `localhost` base URL | a model running on this machine | no |
| `agy` | the `agy` CLI, which has its own login like `claude` | no |
| anything else | whatever `WEBLYZER_AI_BASE_URL` points at, over the OpenAI protocol | yes |

```bash
WEBLYZER_AI=nim
WEBLYZER_AI_MODEL=meta/llama-3.3-70b-instruct
WEBLYZER_AI_API_KEY=nvapi-...
```

**There is no model list in the code, and that is deliberate.** Adding a model
means changing one line in `.env` — no edit, no rebuild. A mistyped model is
rejected by the provider with its own message ("model not found"), and that
message is more useful than "unknown model" from a list gone stale.

One protocol covers most of it: NVIDIA NIM, Groq, OpenRouter, Together, vLLM,
and Ollama all speak `POST /chat/completions`, so they share a single 40-line
caller. Only the base URL differs, and that comes from `.env`. A provider whose
name is not in the preset table still works — give it a
`WEBLYZER_AI_BASE_URL`.

If someone else runs Weblyzer, they write their own `.env` on their own
machine. There is nothing shared: no accounts, no shared key, no bill moving
from one person to another.

The `/model` page **reads** this configuration and names the variable that is
missing. It does not write it. A browser that writes files on your machine is
code that has to be exactly right, and it would save one trip to an editor.

## Requirements

- **Node 24+** (per `engines`; developed on 26) — uses `node:sqlite` and runs
  TypeScript directly, so the scanner has no build step and no `tsx`
- Chromium, installed by Playwright
- Optional: an API key for whichever model you point it at, or a local model
  with no key at all
- Optional: the `claude` CLI, for the GEO and Audit tabs

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

`data.db` creates itself on first use and migrations run automatically. There
are no required environment variables.

`scripts/scan.ts` loads `.env` itself, and that matters: it is a separate
process — spawned by the scan button, and run straight from cron for scheduled
scans. Without that, `WEBLYZER_AI` would look empty on exactly the path nobody
is watching.

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

**AI over HTTP works in a container; the CLI paths do not.** `anthropic` and
the OpenAI-compatible providers are plain HTTPS, which a container has no
trouble with. The `agy` path and the GEO/Audit tabs call CLIs that have their
own interactive login — a browser and a terminal, neither of which exists in a
container — and copying host credentials into the image would put tokens in a
pushable layer. Everything else runs: the five deterministic categories,
Lighthouse, the Excel export, the scheduler, and email.

Credentials are read from the environment at run time, never baked into the
image:

```bash
docker run -d -p 3000:3000 -v ~/weblyzer-data:/data \
  -e WEBLYZER_AI=nim \
  -e WEBLYZER_AI_MODEL=meta/llama-3.3-70b-instruct \
  -e WEBLYZER_AI_API_KEY=nvapi-... \
  -e WEBLYZER_SMTP_URL=smtps://user:pass@smtp.example.com:465 \
  -e WEBLYZER_MAIL_FROM=weblyzer@example.com \
  -e WEBLYZER_MAIL_TO=you@example.com \
  weblyzer
```

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

**No accounts, and this reverses two earlier decisions in a row.** The AI layer
first called CLIs already signed in on the machine; then it grew per-user
encrypted API keys, sign-in, Google OAuth, and guest quotas, because a hosted
instance shared by several people cannot bill one person's subscription for
everyone. That was right for a hosted instance — and Weblyzer is not one. It
runs on the machine of the person using it.

So auth is gone: no sign-in, no sessions, no per-user keys, no guest cookie.
Configuration lives in `.env`, where command-line credentials belong. Storing an
API key encrypted in `data.db` with a secret sitting on the same machine adds no
security at all — anyone who can read the database can read the secret — and it
cost a table, a form, a decrypt path, and a secret that could never be lost.

All of it is in the git history if this ever needs to be hosted again.

**`data.db` holds no credentials.** No password hashes, no API keys. The
`users`, `oauth_akun`, and `ai_kunci` tables are still in the schema and always
empty; dropping them would mean rebuilding `sites` and moving the findings and
runs that reference it, to delete columns nothing reads.

**There is no verification step before the AI layer runs.** The old form saved
a key, checked it against `GET /v1/models`, and refused to use it until that
passed. With configuration in `.env` there is nothing to guard: a wrong key
fails on the first summary and the run records the provider's own message in
`ai_status` / `ai_error`. That is one less piece of hidden state that can go
stale, and the failure names the variable to fix.

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
