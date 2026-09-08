# Weblyzer

A web audit tool for one person looking after a handful of their own sites.

It crawls each site, then splits what it found across seven tabs: Bug, Console,
Security, SEO, GEO, Audit, and Lighthouse. Runs locally, no authentication, no
API keys.

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

Everything else: Excel export with a ready-to-paste fix prompt per problem,
Lighthouse scores measured locally for both mobile and desktop, per-finding
recheck without recrawling the site, and optional AI summaries.

## Requirements

- **Node 24+** (per `engines`; developed on 26) — uses `node:sqlite` and runs
  TypeScript directly, so the scanner has no build step and no `tsx`
- Chromium, installed by Playwright
- Optional: the `claude` CLI, for AI summaries and the GEO/Audit tabs

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

No `.env`, no database setup. `data.db` creates itself on first use and
migrations run automatically.

Every scan also works from the terminal, and the UI calls the same CLI:

```bash
npm run scan -- add-site "Name" https://example.com
npm run scan -- scan <id> [bugs|console|security|seo]
npm run scan -- lighthouse <id>
npm run scan -- geo <id>        # via claude-seo
npm run scan -- audit <id>      # via claude-seo, takes tens of minutes
npm run scan -- jadwal          # every enabled site, for cron
```

## Decisions worth knowing about

**No API keys.** The AI layer calls CLIs that are already installed and already
signed in, so there is no key to store and a subscription you have already paid
for gets used. The consequence is stated plainly in the app: no CLI, no
feature.

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
npm test               # 373 tests
npx tsc --noEmit       # must be clean
```

Many are deliberately proven able to fail rather than merely pass: severity
ordering, the stuck-run threshold, the no-inventing rule in AI prompts, the
non-2xx guard in the SEO analyzer, null scores staying blank in Excel, and the
guarantee that rechecking one finding does not touch the others.

The check that matters most is not automated: **run a scan twice without
changing anything.** If a finding moves to `fixed` and reopens, some checker is
not deterministic.

## What it does not do

No keyword research, SERP data, backlinks, or rank tracking — this audits pages,
it does not do market analysis. No scheduler is installed for you (the CLI
command exists; wiring it to cron is yours). No email notifications yet. No
Dockerfile yet. The UI has no automated tests.

Around 8,200 lines of source and 4,600 lines of tests. One runtime dependency
outside Next, React, Playwright, and Lighthouse: `write-excel-file`.

## Status

Built for one person's own sites and shared in case the approach is useful.
There is no license file, so no rights are granted beyond viewing — open an
issue if you want to use it for something.
