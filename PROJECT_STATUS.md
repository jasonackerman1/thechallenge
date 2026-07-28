# Project Status — updated 2026-07-28

Fantasy league PWA for MTV's *The Challenge* S42: Cutthroat. Full architecture plan lives at
`/Users/jackerman/.claude/plans/i-m-building-a-fantasy-valiant-ocean.md` on Jay's machine — read
that first for the complete data model, sync strategy, and UI spec.

## Done

- **Milestone 1 (data layer)** + **Milestone 2 (draft/scoring engines)** — built and validated:
  - `js/state.js` — localStorage cache + pendingWrites queue
  - `js/gist.js` — GitHub Gist API + fetch-merge-write sync protocol
  - `js/draft.js` — reusable snake-draft engine (preseason draft + every weekly redraft)
  - `js/scoring.js` — pure computed-values engine (roster points, safe-pick points, standings, leaderboard)
  - `js/seed.js` — seed data (6 managers, 24 cast members)
  - `index.html` + `js/app.js` — **temporary debug shell only**, not the real UI — lets you connect
    a Gist token, seed initial data, and see raw state + computed leaderboard as JSON

Validated with direct node scripts: 24 cast ÷ 5 managers → correct 4-round snake draft with
round reversal; exclusivity correctly blocks double-claimed/eliminated cast; scoring formulas
match hand-calculated expectations.

Confirmed 2026-07-28: Jay created his real GitHub token + Gist, connected the debug shell,
seeded initial data, and verified the leaderboard via "Force Reload from Gist" — the full
Gist round-trip works end-to-end. (Along the way, fixed a bug in `js/app.js`'s `render()` that
crashed with "state.managers is not iterable" when connecting to a freshly-created empty
`{}` Gist, before seeding.)

## Not done yet

- **The live Gist Jay already seeded still has old test data with "Victoria" (inactive)** — since
  `buildInitialState()` is a one-time seed function, this code fix doesn't retroactively touch
  data already written to the Gist. Re-run "Seed Initial Data" (wipes it, fine since it's just
  test data) or edit the Gist's `state.json` by hand before starting real Milestone 3 testing.
- **Milestone 3 (commissioner scoring UI) is next** — episode entry, eliminations, confessional
  minutes, preseason draft setup, redraft-twist toggle, manual roster-freeze toggle + endgame-scarcity
  warning banner, Victoria toggle. This replaces the debug shell.
- Milestones 4 (player views), 5 (PWA shell: manifest/service worker/icons/design system), and
  6 (hardening/deploy) are all still pending.

## Key decisions locked in (don't re-litigate)

- Preseason draft roster covers **Episode 1 only**; twist reveals right after Episode 1; every
  week from Week 2 onward gets a fresh redraft, all the way to the finale — no scripted auto-lock.
- A **manual "Freeze Rosters" button** (commissioner-only, any week, any reason) is the only lock
  mechanism — replaces an earlier "trivia episode" auto-freeze idea that got dropped.
- **Roster size is dynamic**: `max(1, floor(remaining eligible cast ÷ active managers))` — not a
  fixed 5, since 24 cast members don't divide evenly across 5-6 managers and the pool only shrinks.
- **Weekly redraft order is purely reverse standings for every manager, including Jay** — no
  special-casing the commissioner to always pick last.
- **Endgame scarcity** (cast pool eventually too thin for everyone to redraft) is a real
  acknowledged open problem — see the plan's "Endgame Scarcity Handling" section for the
  recommended fix (roster-size floor + in-app warning + manual freeze as the off-ramp).
- **Resolved 2026-07-28: Victoria is out, her husband Steve plays in her place.** Still 6 managers
  total. No active/inactive toggle needed — Steve is just a regular active manager like everyone
  else. `js/seed.js` updated (`victoria` id/name swapped for `steve`, `active: true`).

## Setup instructions for the debug shell (given to Jay, unconfirmed if completed)

1. Create a GitHub Personal Access Token (classic, `gist` scope only) at github.com/settings/tokens.
2. Create a private Gist at gist.github.com with a file named `state.json` containing `{}`.
3. `cd` into this repo, run `python3 -m http.server 8000`, open `http://localhost:8000`.
4. Paste token + Gist ID into the connect form, click Connect.
5. Click "Seed Initial Data," set a commissioner password when prompted.
6. Confirm the raw state + leaderboard render, then click "Force Reload from Gist" to confirm
   it actually round-tripped through GitHub (not just local cache).
