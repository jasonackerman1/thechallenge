# Project Status — updated 2026-07-28

Fantasy league PWA for MTV's *The Challenge* S42: Cutthroat. Full architecture plan lives at
`/Users/jackerman/.claude/plans/i-m-building-a-fantasy-valiant-ocean.md` on Jay's machine — read
that first for the complete data model, sync strategy, and UI spec.

## Done

**Milestone 1 (data layer) + Milestone 2 (draft/scoring engines)** — built and validated:
- `js/state.js` — localStorage cache + pendingWrites queue + credentials + player identity
- `js/gist.js` — GitHub Gist API + fetch-merge-write sync protocol
- `js/draft.js` — draft engine (snake board for preseason, straight board for weekly redraft —
  see "Redraft mechanic" below)
- `js/scoring.js` — pure computed-values engine (roster points, safe-pick points, standings,
  leaderboard, season-end bonus points)
- `js/seed.js` — seed data: 6 managers, 24 real cast members with verified gender
- Confirmed live: Jay's real GitHub token + Gist round-trips correctly end-to-end (seed → write →
  "Force Reload from Gist" → confirmed it came from GitHub, not just local cache).

**Milestone 3 (commissioner scoring UI) — complete**, except the intentionally-deferred
redraft-twist toggle (see "Not done yet"). All in `js/views/commissioner.js` unless noted:
- Preseason draft: password-gated, random round-1 order, snake, one-pick-at-a-time entry, gender
  hint while picking (non-blocking).
- Episode entry: scoring events, confessional minutes, eliminations, finalize, plus an
  "unfinalize most-recent-episode" correction escape hatch (only reopens the *most recent*
  finalized episode, not arbitrary earlier ones — a known scoping limit).
- Weekly redraft: reverse-standings order, straight (non-snake) board, target-4 roster that lets
  the pool run dry rather than shrinking uniformly (see "Redraft mechanic" below), a "Past
  Redrafts" history so a week's shortfall doesn't just vanish once that week completes.
- Freeze Rosters toggle (confirm-gated) + a scarcity warning banner (fires when eligible cast
  drops below the active manager count).
- Final challenge point entry: pick winner/2nd/3rd from surviving cast, awards
  `FINAL_CHALLENGE_POINTS` to whoever rostered them on their final roster.
- Whole commissioner UI is mobile-first + responsive (single column on phone; rows go
  horizontal and the elimination checklist goes 2/3-column at tablet/desktop widths).

**Milestone 4 (player views) — in progress:**
- Player identity: first-open modal ("Who's using this device?"), remembered per-device in
  `localStorage`, persistent "Playing as X — Switch" indicator to reopen it. `js/views/player.js`.
- Leaderboard: rank, grand total, this-week roster/safe-pick points, bonus points, current
  manager's row highlighted, no password gate. Sits above the Commissioner section since that's
  what most of the family will actually open the app for.
- **My Roster — built 2026-07-28, self-service picking** (Jay confirmed managers should submit
  their own picks from their own phone, not just view a read-only status — a bigger build than
  originally scoped, since it's genuinely concurrent now). Phase-aware in `renderMyRoster`
  (`js/views/player.js`):
  - No preseason draft yet → waiting message.
  - Preseason done, Episode 1 not finalized → Week 1 roster, read-only (matches plan: Week 1 is
    always fixed/read-only regardless of self-service).
  - Between redrafts (waiting on episode finalization, or waiting on the commissioner to open the
    next week) → status message + current roster for context.
  - **Live redraft, not your turn** → shows whose turn it is and your roster so far; no pick form
    rendered at all (turn enforcement is a UI-gating decision, not just cosmetic — see below).
  - **Live redraft, your turn** → real pick form: available cast (excludes eliminated + already
    claimed this draft), the same non-blocking gender hint as the commissioner picker, submit.
  - Frozen → final roster, read-only.
  - **Turn enforcement, deliberately not left to `validatePick` alone:** `validatePick` itself
    doesn't hard-block out-of-order picks (a manager could otherwise submit any of their
    remaining rounds whenever they want) — that would let someone "cut in line" and undermine the
    whole reverse-standings fairness the redraft simulation was about. So the picker only renders
    at all when `flattenDraftBoard(board)[picks.length].managerId` matches the viewing manager;
    everyone else only sees status. The actual mutation (`onPick` in `js/app.js`) re-checks this
    same condition against freshly-fetched state before writing (same fetch-merge-write pattern
    as everywhere else), so if two people's turns somehow overlapped, the loser gets a clear
    "it's not your turn anymore" error instead of a silently wrong pick.
  - New shared module `js/views/shared.js` (`managerName`/`castName`/`castNameWithGender`) —
    pulled out of `commissioner.js` once `player.js` needed the same helpers, matching the plan's
    original file-structure spec.
  - Verified live: all 6 phase branches (no draft / week-1 read-only / waiting / not-your-turn /
    your-turn / frozen) render correctly, including that a non-active manager correctly sees no
    pick form at all.
- Not yet built: Safe Pick, Preseason Bonus Pick, Cast Browser.

## Not done yet

- **Milestone 4 remainder:** Safe Pick, Preseason Bonus Pick, Cast Browser.
- **Redraft-twist reveal toggle** — intentionally deferred. Nothing in the app reads
  `meta.redraftTwistRevealed` yet; it only matters once a player view exists to hide/reveal the
  redraft feature from the family, so building the toggle now would be inert.
- **Milestones 5 (PWA shell: manifest/service worker/icons/design system)** and **6
  (hardening/deploy)** are both still pending.
- **Known open item for the Milestone 5 design pass:** the "Switch" identity link is currently a
  plain always-visible button — anyone can tap it and act as another manager (submit their
  redraft picks, safe pick, etc.). Low risk in a trusted-family context, but Jay flagged it
  explicitly and wants it addressed once there's a real design pass — likely burying it in a
  settings/profile area instead of a bare button. Don't lose track of this.

## Key decisions locked in (don't re-litigate)

- Preseason draft roster covers **Episode 1 only**; twist reveals right after Episode 1; every
  week from Week 2 onward gets a fresh redraft, all the way to the finale — no scripted auto-lock.
- A **manual "Freeze Rosters" button** (commissioner-only, any week, confirm-gated) is the only
  lock mechanism — built, see above.
- **Redraft mechanic (superseded once, now locked in 2026-07-28):** roster size is NOT a
  shrinking-formula target — every manager always *targets* `TARGET_ROSTER_SIZE = 4`
  (`js/draft.js`). The draft board is always built for 4 rounds; the pick sequence runs until
  either every slot fills or the cast pool runs dry, whichever comes first — whoever's picking
  when it runs out that week ends up short. This replaced an earlier per-gender-floor formula
  that a simulation showed would crash rosters to 0 for the season's last ~4 weeks. **Weekly
  redraft uses a straight (non-snake) board** — a second simulation (same random world, snake vs.
  straight compared head-to-head) showed snake's round-parity systematically shortchanges
  whoever's currently in last place (90-point final spread, one manager ran away with it), while
  straight shortchanges whoever's currently in first instead and kept the season within 15
  points — the actual equalizing effect the mechanic was meant to have. Preseason draft keeps
  snake (`buildDraftBoard`) since its round-1 order is random, not standings-based, so the bias
  never applied there. Full writeup + both simulation artifacts referenced in project memory
  (`challenge_fantasy_redraft_simulation.md`).
- **Weekly redraft order is purely reverse standings for every manager, including Jay** — no
  special-casing the commissioner.
- **Gender balance is a soft pick-time preference, not a hard rule** ("attempt boy, girl, boy,
  girl — if the roster size ends up odd, it is what it is") — built, see above. Real gender data
  for all 24 cast sourced from actual Season 42 cast coverage (Variety/Deadline/TVLine, cross-
  verified for ambiguous names), not a placeholder — confirmed exactly 12M/12F, 4-and-4 per team.
  `seed.js`'s short nicknames map to real names as `Tori`=Victoria Deal, `Izzy`=Isabella
  Fairthorne, `Lete`=Alexis Lete, `Chris` (Grey team)=Chris Underwood.
- **Victoria is out; her husband Steve plays in her place**, as a normal active manager (still 6
  managers total, no active/inactive toggle needed).
- **Player identity is a first-open modal + persistent switch link**, not an inline control tied
  to one view — it's global device state that matters to every player-specific feature, not just
  the leaderboard (Jay corrected an earlier inline-control build on this point).

## Setup instructions for the debug shell

1. Create a GitHub Personal Access Token (classic, `gist` scope only) at github.com/settings/tokens.
2. Create a private Gist at gist.github.com with a file named `state.json` containing `{}`.
3. `cd` into this repo, run `python3 -m http.server 8000`, open `http://localhost:8000`.
4. Paste token + Gist ID into the connect form, click Connect.
5. Click "Seed Initial Data," set a commissioner password when prompted.
6. Confirm the raw state + leaderboard render, then click "Force Reload from Gist" to confirm
   it actually round-tripped through GitHub (not just local cache).

Jay's live test Gist has completed this setup and been re-seeded since the Steve/Victoria swap
and the `gender` field were added (confirmed: raw state shows `"steve"` and `gender` fields
present) — no further re-seed needed unless the schema changes again.
