# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-user vocabulary/spelling tool in three loosely-coupled parts:

- **`server/`** — a Cloudflare Worker that proxies Merriam-Webster lookups, caches them in Workers KV, stores saved words, and serves the spelling-practice web page at `GET /`.
- **`mac-app/`** — a macOS menu-bar app. Global hotkey ⌘⇧L reads the current selection in any app, looks it up via the Worker, and offers one-click Save.
- **`vocabulary.md` + `generate_wiki.py` → `wiki/`** — a separate, offline pipeline that renders a word list into an Obsidian-style wiki. Unrelated to the server/app runtime.

Design rationale and alternatives considered are in `docs/decision/001-stack.html`; the build log and go-live checklist are in `docs/plan/001-phase1-summary.html`.

## Commands

```bash
# Server (pnpm — a pnpm-lock.yaml is committed)
cd server
pnpm install
pnpm dev                      # wrangler dev; needs .dev.vars (copy .dev.vars.example)
pnpm test                     # vitest run — offline, MW and KV are both mocked
pnpm test test/mw.test.ts     # single file
pnpm test -t "cache"          # single test by name
pnpm typecheck                # tsc --noEmit
pnpm deploy                   # wrangler deploy

# Mac app (SwiftPM, no external dependencies)
cd mac-app
./build-app.sh                # builds release + wraps into build/SpellingLookup.app
open build/SpellingLookup.app

# Wiki
python3 generate_wiki.py      # regenerates all of wiki/ from vocabulary.md
```

## The cross-language JSON contract

**The single most important thing to know.** The Worker's normalised lookup shape has three
independent consumers that must be changed together:

1. `server/src/mw.ts` — `WordEntry` / `Suggestions` (the producer)
2. `mac-app/Sources/SpellingLookup/ApiClient.swift` — `WordResult` (Swift `Decodable` mirror)
3. `server/src/page.ts` — the practice page's inline JS reads the same fields

There is no shared schema or codegen tying these together, and nothing catches drift at build time.
**Both consumers then fail silently:** every field on `WordResult` is optional, so a renamed or
removed key just decodes to `nil`, and the page renders blanks. Even a genuine type mismatch surfaces
only as the generic "Unexpected response from server." If you add or rename a field in the normalised
entry, update all three.

The result is a union discriminated by the presence of `word`: a hit is a `WordEntry`, a miss is
`{ suggestions: [...] }`. `isEntry()` is the guard; `ApiClient.swift` mirrors this by making every
field optional and checking `word == nil`.

## Server architecture

`src/index.ts` is a single `fetch` router with a hard auth boundary: `GET /` (the practice page) is
public, **everything else requires the bearer token** (`src/auth.ts`, one static token shared by the
Mac app and the page — Phase 1 is single-user by design).

Two KV keyspaces in one namespace (`VOCAB`):

| Key | Contents | TTL |
|---|---|---|
| `def:<word>` | cached normalised lookup | 30 days |
| `word:<word>` | saved word + practice stats | none |

Only *successful* lookups are cached — a `suggestions` miss is deliberately not written, so a
typo'd word doesn't pin a negative result for 30 days. Every handler normalises input with
`.trim().toLowerCase()` before touching KV; keep that consistent or you will write keys that later
reads can't find.

`src/mw.ts` handles Merriam-Webster's awkward JSON: definitions come from top-level `shortdef` with
a recursive `dt`→`text` fallback, examples from `vis` nodes nested at arbitrary depth (`walkDt`), and
`stripTokens()` removes MW's inline markup (`{bc}`, `{it}`, `{sx|word||}`, …). Test fixtures in
`test/fixtures/` are real MW response shapes — prefer extending them over hand-writing new mocks.

`src/page.ts` is the entire practice page as one exported template string, intentionally: the Worker
ships with no build step and no static assets.

## Mac app: the three non-obvious mechanisms

- **`HotKey.swift`** — Carbon `RegisterEventHotKey`. The C event handler must be a capture-less
  function pointer, so instances are reached through a `static` registry keyed by hotkey id rather
  than captured. The hotkey is hardcoded to ⌘⇧L (see constraints below).
- **`SelectionReader.swift`** — there is no API to read another app's selection, so it synthesises
  ⌘C, polls `NSPasteboard.changeCount` briefly, then **restores the user's previous clipboard**.
  This requires Accessibility permission; without it the hotkey silently does nothing.
- **`LookupModel.Phase`** — an `idle / loading / result / suggestions / error` enum that is the
  single source of truth for what `ContentView` renders. Add UI states here, not as extra `@Published` flags.

`AppDelegate` uses `NSStatusItem` + `NSPopover` rather than SwiftUI's `MenuBarExtra`, because a
`MenuBarExtra` panel can't be reliably opened from a global hotkey. It also calls
`NSApp.activate(ignoringOtherApps:)` before showing the popover — an `.accessory` app isn't frontmost,
and without this the popover appears but won't take keyboard focus.

## Constraints and gotchas

- **SwiftPM must build outside `~/Documents`.** It is iCloud-synced, and SwiftPM's SQLite `build.db`
  throws "disk I/O error" there. `build-app.sh` passes `--scratch-path "$TMPDIR/spelling-build"`; if
  you invoke `swift build` by hand, pass the same flag or it will fail.
- **Only Command Line Tools are installed, not full Xcode.** Anything requiring Swift macros won't
  build — this is why there are no SPM dependencies and why the hotkey is hardcoded rather than using
  a rebindable-shortcut library.
- **`wiki/` is 100% generated.** Edit `vocabulary.md` and re-run `generate_wiki.py`; never hand-edit
  files under `wiki/`. The entry regex is strict (`**word** *(pos)* — Definition. *"Example."*`) and
  silently skips lines that don't match, so check the printed entry count after a run.
- **`generate_wiki.py` hardcodes absolute paths** to this checkout (`VOCAB_FILE`, `WIKI_DIR`). It
  only works from this machine/location as written.
- **Nothing is deployed yet.** The KV namespace id in `wrangler.toml` is a placeholder and the
  `MW_KEY` / `API_TOKEN` secrets are unset. The tests mock MW entirely, so they cannot confirm the
  live `learners` endpoint — the go-live steps and the `curl` that gates it are in
  `docs/plan/001-phase1-summary.html`.

## Docs convention

Documents live under `docs/` as HTML: decisions in `docs/decision/`, plans in `docs/plan/`, both
sequence-numbered, with implementation summaries alongside their plan as `NNN-<name>-summary.html`.
