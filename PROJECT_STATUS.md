# Project Status — updated 2026-08-06 (confessional per-occurrence scoring, leaderboard team rosters, My Roster weekly-stats popup, service worker stale-cache fix)

Fantasy league PWA for MTV's *The Challenge* S42: Cutthroat. Full architecture plan lives at
`/Users/jackerman/.claude/plans/i-m-building-a-fantasy-valiant-ocean.md` on Jay's machine — read
that first for the complete data model, sync strategy, and UI spec.

**THE REAL SEASON IS LIVE. Twist has been revealed. Episode 1 has been scored for real.** Jay ran
the real preseason draft, everyone's in the app, and he's just finished scoring the first real
episode on the live Gist — this is now steady-state support on a live season (small scoring-rule
tweaks and UI polish as Jay actually uses the app), not a build phase.

**Git status: clean and pushed.** Commit `0e769af` (2026-08-06) — service worker fix, see below —
on top of `bc6fca9` (same day) — confessional bonus removed in favor of a flat +5 every time one
is logged, commissioner's Add Event dropdown now defaults to Confessional, leaderboard rows now
list each manager's current team roster, and My Roster cast cards are now clickable and open a
stats popup with a week-by-week points breakdown (see below) — on top of `dbd8792` (fixed disabled
reminder buttons that looked identical to enabled ones), `67440ad` (Commissioner Reminders block:
clipboard-copy Safe Pick / Turn reminder buttons), `664fe64` (app icon replaced with the real
biohazard symbol) — on top of `a4eb156` (Safe Pick hit cards now grey out like every other
locked-out state), `5c1013f` (pre-share readiness pass: Refresh button + auto-refresh, offline
retry, multi-episode reopen, iPad orientation unlock), `5fa98d1`/`a928615`/`509ac61`/`3d0e355`/
`da6eaea` (confessional-count rework, Season Status banner, a cut Gist API request, status doc
updates), `2e03116` (Commissioner panel visual design pass), `0145a21` (redraft-twist reveal
toggle), and everything before that (PWA shell, Milestone 4, etc. — see history further below).
No local uncommitted changes, no untracked files, all on `origin/main`.

## Confessional scoring changed to per-occurrence + weekly stats popup + a scary-but-transient connect-screen incident — 2026-08-06 (`bc6fca9`, `0e769af`)

Jay finished scoring Episode 1 for real (draft done, everyone in the app, "everything looking
good") and asked for three adjustments, all shipped in `bc6fca9`:

- **Confessionals now score +5 every time one is logged**, not a one-time "+5 to whoever has the
  most confessionals this episode" bonus. `CONFESSIONAL_BONUS_POINTS`/
  `computeMostConfessionalsCastIds` deleted from `js/scoring.js`; `SCORING_EVENT_POINTS.CONFESSIONAL
  = 5`. Since scoring always recomputes fresh from raw events (never cached), this retroactively
  changed the value of any confessionals already logged for Episode 1 — worth Jay spot-checking
  that episode's confessional tally against what the family already saw live.
- **Commissioner's Add Event dropdown now defaults to Confessional** — moved to the top of the
  `SCORING_EVENT_POINTS` object (the dropdown iterates insertion order), since Jay expects to
  score that most often.
- **Leaderboard rows now show each manager's current team roster** ("Team: Name1, Name2, ...",
  eliminated cast struck through), and **My Roster cast cards are now clickable**, opening the
  same bio modal Cast Browser uses, now extended with a "Weekly Stats" section — one block per
  finalized episode showing exactly which event scored what (e.g. "Confessional x3: +15", "Cried:
  -5", "Survived the week: +5"), computed fresh every time the modal opens. Full detail in project
  memory `challenge_fantasy_app.md`.

**Right after that push, Jay reported his phone's installed app reverted to the connect screen
(asking for Token + Gist ID again) and the Connect button did nothing when he re-entered them.**
Investigated live: GitHub Pages had built and deployed `bc6fca9` correctly (confirmed via the
Pages API), and the served JS files matched the local repo byte-for-byte — so the deployed code
itself was fine, and desktop confirmed this (Jay: "it works fine on the web on desktop"). That
pointed at something device-local rather than a real code bug: the service worker's
`NETWORK_FIRST_FILES` fetch handler in `sw.js` called `fetch(event.request)` with no explicit
cache-control override, so the browser's own HTTP cache could silently serve back a stale response
even on that "network first" path — risking two network-first files (e.g. `app.js` + `scoring.js`)
ending up mismatched with each other right after a deploy, which breaks the JS module graph and
would explain both symptoms exactly (stuck on the default connect-screen markup, and a dead
Connect button with no listener ever attached). **This is the identical bug class already found
and fixed on the Storm PWA** — see that project's memory. Fixed in `sw.js`: fetch now uses
`{ cache: "no-store" }` explicitly, and `CACHE_NAME` bumped to `challenge-fantasy-v2` so every
device gets a clean cache on its next successful load. Pushed as `0e769af`.
**Before that fix even went out, Jay reopened the app on his own and it was back to normal without
asking for credentials again** — so the underlying trigger may have been a transient blip (or
resolved itself once the SW/cache settled), not something that was ever confirmed to reproduce.
Treat the `sw.js` fix as hardening for a real latent bug class, not a confirmed root-cause fix for
this specific incident — if it recurs for Jay or any of the other 5 managers, the fix is to clear
that browser's site data for the app (or delete/reinstall the home-screen icon) and re-enter
Token + Gist ID once.

## Scoring question re-confirmed + a real-world pacing contingency noted — 2026-08-01

No code changes this session — Jay asked two things, both answered by walking through the actual
code rather than from memory:

- **"Once a player is eliminated, they don't earn more points, right?"** Confirmed. Two mechanisms
  enforce it: (1) `computeCastPointsForEpisode` (`js/scoring.js`) only awards the +5
  Survived-the-Week bonus when a cast member is rostered *and not yet eliminated as of that
  episode* — so the elimination episode itself pays no survival bonus, though other same-episode
  event points already earned still count (this half was already confirmed with Jay on
  2026-07-30, see below). (2) `getAvailableCast`/`validatePick` (`js/draft.js`) exclude eliminated
  cast from every future weekly redraft, so they can never be rostered again after their
  elimination episode — not just "no more survival points," genuinely zero points possible from
  the next episode on, since they can't appear on anyone's roster at all.
- **Speculation about Paramount+ dropping multiple episodes at once.** Jay's heard this might
  happen (unconfirmed) and is already leaning toward a house rule of still processing one episode
  per Wednesday regardless of how many actually air, if it comes to that. Confirmed this needs
  **zero app changes** either way — scoring is keyed off `episodeNumber`, not a real calendar
  date, so the commissioner panel already supports entering/finalizing episodes at whatever pace
  the group agrees to. Purely a group pacing decision, not an engineering one. Noted in memory as
  an open contingency, not acted on further.

## App icon replaced — 2026-07-30 (`664fe64`)

Jay wanted a better icon than the old C42 monogram. Went through three concepts: a hand-drawn
chrome dagger, then a hand-approximated grungy biohazard trefoil (Jay: "use a grungy biohazard
logo") — both reasonable, but once Jay supplied his own clean reference image and said "that's
terrible, use my reference, make it vector, one color, dark blue background," hand-tuning circle
math to match it by eye was the wrong approach. Instead: found the actual official public-domain
biohazard symbol SVG on Wikimedia Commons and rendered it exactly (no local SVG rasterizer was
installed, so rendered it precisely by loading the raw SVG in a minimal HTML page and
screenshotting it via headless Chromium at high resolution) — pixel-perfect match to Jay's
reference, not an approximation. One bug caught mid-process: an injected CSS rule meant to force
a fill color ended up overriding the SVG's internal `<mask>` background rect too, inverting the
whole shape into three disconnected lens shapes — fixed by rendering the SVG completely
unmodified and only recoloring pixels in the final raster afterward. Final icon: solid white
symbol on the app's actual `--bg-void` (`#0a0d18`), crisp at every size down to real 60px
home-screen size — replaced all 5 icon files in place (same filenames, no manifest/sw.js changes
needed).

**Lesson for next time a hand-drawn approximation of a real/well-known symbol isn't landing:
look for the authoritative source (official spec, public-domain vector, a real supplied asset)
before iterating on guessed proportions — faster and strictly better than eyeballing it closer.**
Also: draft preview images need to live inside the actual project folder (not an external
scratchpad) if Jay needs to open them in his own editor/Finder — a `icons/_drafts/` folder
(deleted before the final commit) fixed this after he couldn't find the first round of previews.

## Family setup instructions written — 2026-07-30/31

Jay asked for clear, forwardable instructions for the other 5 managers: installing the app to the
home screen and connecting with the shared Token + Gist ID. Given directly in conversation as a
single plain-text copy/paste block, deliberately not committed to this repo or saved in memory —
that Token can wipe the whole season, so it should only ever live in Jay's own private messages
to each manager, not in a file.

**Correction: Chrome on iOS installs to the home screen fine, not just Safari.** First draft
claimed only Safari supports a true standalone PWA install on iOS — Jay corrected this from his
own repeated real-device testing (he's been using Chrome for every home-screen install this whole
project) and corrected the exact tap sequence (Share icon in the URL bar → "View More" → scroll →
"Add to Home Screen"). Final instructions cover both browsers without ranking one as better.

**GitHub API rate limit note — hit TWICE now, second time mid-live-simulation.** First hit
2026-07-29/30 during automated testing (see below); recurred 2026-07-30 while Jay was running his
own live simulation pass post-twist-reveal, this time actually blocking him mid-task rather than
just being a background annoyance. Same root cause both times: heavy automated verification against
a token tied to Jay's real account shares that account's 5,000 req/hour budget with his real usage.
No data lost either time, resets on a rolling hourly window. **Going forward: default to NOT
running rounds of automated testing against Jay's real account token while he might be actively
using the live app in the same rough window** — this is now a known recurring failure mode, not a
one-off. The mocked-Gist Playwright pattern (route-intercept `api.github.com`, a fixture built from
the app's own `seed.js`/`draft.js`, zero real requests) used for the pre-share readiness pass below
is the template to reuse instead whenever verification is actually needed.

## Pre-share readiness pass — 2026-07-30 (`5c1013f`, `a4eb156`)

Jay asked directly: is it time to share with the family, any gaps, do we need more work? Did a
real pass over the live codebase (not just memory) to check what's actually built vs. only
planned. Core draft/scoring engine held up; found and fixed 4 real gaps plus one visual bug Jay
caught after testing:

1. **No manual refresh for non-commissioner managers.** The only "Force Reload" button lived
   inside the Commissioner password-gate; everyone else only got fresh state on page load or
   after their own mutation — no polling, no refresh-on-resume. A backgrounded/resumed installed
   PWA could sit stale indefinitely with no way to know it's your redraft turn. **Fixed:** a
   visible Refresh button for everyone, plus silent auto-refresh on `visibilitychange` and a 60s
   foreground poll — both skip themselves while a form control has focus or Commissioner is
   unlocked, since every view re-renders via wholesale `innerHTML` and a mistimed auto-refresh
   would otherwise silently wipe a half-filled form. Jay tested this live on localhost.
2. **Offline pending-write queue was dead code.** `state.js` had `enqueuePendingWrite`/
   `clearPendingWrite` from the original plan, but nothing ever called them. Closures can't be
   persisted to localStorage, so a true durable queue wasn't feasible without a bigger refactor;
   instead scoped correctly as an in-memory retry — a genuine connectivity failure (`TypeError`,
   not a rejected pick, not a bad HTTP response) holds the mutation in memory and replays it
   automatically on the next successful connectivity signal. Removed the dead scaffolding rather
   than leave it unused. Jay chose to trust the automated verification on this one rather than test
   it live himself ("everyone will be home on wifi").
3. **"Reopen episode" could only ever reopen the single most recent finalized episode**, and only
   when no newer episode had been started. Root cause was structural — `getCurrentEpisode` was
   "the last array item, if unfinalized," coupling the edited episode to array position.
   **Fixed properly:** redefined it as "whichever episode isn't finalized" (position-independent),
   added a dropdown to reopen any finalized episode, and the edit form now distinguishes
   "(in progress)" from "(reopened for corrections)" with a reminder banner. Confirmed via
   `scoring.js`'s `finalizedWeeks()` that reopening a middle episode correctly drops just that
   episode's points from the leaderboard while later ones keep counting. Known, disclosed
   limitation: doesn't retroactively recompute weekly redraft orders that already happened
   downstream of a correction — the confirm dialog says so. Jay tested this live and confirmed it.
4. **Manifest force-locked orientation to portrait**, untested on any device but Jay's iPhone.
   Jay confirmed the whole family plays on iPhone/iPad — no Android testing needed, but the
   portrait lock would have fought iPad users rotating to landscape. Removed the lock once the
   CSS was confirmed already responsive up to tablet/desktop widths.
5. **Safe Pick "hit" cards still looked bright/active/tappable** (`a4eb156`, found after Jay tried
   the app live) — only "miss" and "eliminated" got the dimmed/greyscale treatment, even though a
   hit is equally locked out (used once per manager all season). Fixed `.cast-card.sp-success` to
   use the same dim background + greyscale image as `.sp-miss`, keeping only the green
   badge/status text as the "correct pick" signal.

**Verification method — mocked-Gist Playwright, zero real GitHub API cost.** Given the rate-limit
recurrence above, none of this touched Jay's real account/token for automated testing. Built a
synthetic fixture via Node (importing the app's own `seed.js`/`draft.js` so it's structurally
valid), served the real repo locally, and used Playwright with full `page.route()` interception of
`https://api.github.com/**` — every request goes to an in-memory mock. 17/17 functional checks
passed plus a visual screenshot check for the Safe Pick fix. One harness bug caught along the way:
the mock's GET handler re-serialized state with different JSON formatting than the app's own
`writeState`, which made `commitMutation`'s write-confirmation check spuriously fail — fixed by
having the mock replay the exact raw string it was given instead of re-serializing.

## Two scoring rules confirmed with Jay — 2026-07-30

1. **Survived-the-Week (+5) is withheld starting the episode someone is eliminated**, not just
   future episodes — other same-episode points (event points, the confessional bonus) are not
   withheld, only the survival bonus specifically excludes it. Confirmed correct after walking
   through the actual code path with a concrete example.
2. **Roster ownership is strictly per-week, not season-long** — `getRosterForWeek` looks up that
   week's own draft results only, so a cast member's points always go to whoever drafted them
   *that specific week*, with no season-long carryover if they move to a different manager in a
   later redraft. Confirmed correct, no code change.

**Draft night is Saturday, Aug 1, 2026, 8:30pm** — confirmed by Jay, used as the Preseason Mode
countdown target (`js/views/player.js`'s `DRAFT_COUNTDOWN_TARGET`, parsed as local device time).

**Live URL: https://jasonackerman1.github.io/thechallenge/** — GitHub Pages wasn't actually
enabled before this (`has_pages: false` via the API); enabled it serving from `main`/root, added
`.nojekyll` so GitHub serves the static files as-is instead of running the default Jekyll build.
**Confirmed by Jay on his actual phone, 2026-07-29: loaded the live URL and successfully added it
to his home screen ("saved it to my desktop on my phone").** This closes out the one open
verification gap from the PWA shell work — everything before this had only been checked with
headless Chromium, not a real device.

**Live test-season state (Jay's real Gist):** preseason draft complete, Episodes 1-3 scored and
finalized (Episode 3 included an intentional elimination of a couple of managers' safe picks, to
confirm the leaderboard correctly zeroed their safe-pick points), Weeks 2-3 redrafted (Week 3
fully drafted by Jay switching through manager identities and picking for each one in turn via
**My Roster**, not the commissioner UI), safe picks submitted for all 6 managers in Week 3.

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

**Milestone 4 (player views) — complete:**
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
  - Verified live via automated Playwright checks (all 6 phase branches render correctly,
    including that a non-active manager sees no pick form at all), **and then verified for real
    by Jay**: he drafted a full round of Week 3 by switching through each manager's identity via
    the "Switch" link and picking for each one in turn — confirmed the turn-gating actually holds
    up in practice, not just in a scripted test.
- **Safe Pick — built 2026-07-28** (`renderSafePick` in `js/views/player.js`): each manager picks
  one cast member per week they think survives that episode, +`SAFE_PICK_POINTS` (10) if right.
  Each cast member usable only once per manager all season (`getUsedSafePicks`), eliminated cast
  excluded. Locking rule: reuses `nextEpisodeNumber(state)` unchanged — it already returns "next
  week" the moment the *current* episode is started (not just finalized), which is exactly the
  right fairness cutoff (no picking once results might already be known), so no new helper was
  needed. Shows past weeks' picks + points earned; lets you change your current week's pick before
  it locks (a "Clear" button + re-submit). **Bug found and fixed during live verification, before
  reporting done:** the current week's own existing pick was being counted as "already used
  this season" against itself, so it silently vanished from its own "change pick" dropdown and
  the intended pre-selected value never actually applied — fixed by excluding the current week's
  own pick from that exclusion set. Confirmed fixed via a direct `inputValue()` check on the
  select element, not just eyeballing the rendered HTML. **Confirmed live by Jay**: safe-picked
  for all 6 managers by switching identities, then scored an episode with an intentional
  elimination of a couple of the picked cast members — leaderboard correctly showed 0 for those
  managers' safe-pick points.
- **Cast Browser — built 2026-07-28** (`renderCastBrowser` in `js/views/player.js`, read-only, no
  identity needed): all 24 cast grouped by team, status (Active / Eliminated + episode number),
  and season point total. New `computeCastSeasonPoints(state)` in `js/scoring.js` — didn't exist
  before, since every other scoring function is manager-centric (roster points, safe-pick
  points); this one sums a cast member's own points across all finalized episodes independent of
  who rostered them, including the Survived-the-Week bonus whenever they were on *any* roster
  that week. Verified live: daily-challenge winner correctly shows even split of the base event
  points + survive bonus (10 = 5+5), a same-episode eliminated cast member correctly shows 0 (no
  survive bonus that episode, matches the existing "eliminated this episode still keeps points
  earned earlier in it" rule), everyone else shows the flat 5-point survive bonus.
- **Preseason Bonus Pick — built 2026-07-28. Milestone 4 is now fully complete.**
  (`renderPreseasonBonusPick`/`isPreseasonBonusPickLocked` in `js/views/player.js`): one-time
  1st/2nd/3rd season-finish prediction, +30/+20/+10 if correct. Locks the moment Episode 1 is
  finalized (`isPreseasonBonusPickLocked` — checked at both the UI-render level and again inside
  the actual mutation before writing, same defense-in-depth pattern as every other locking rule
  in this app). Once locked, shows the manager's locked-in pick read-only, with a "&#10003;
  correct" marker per prediction once the final challenge results are in. Verified live across 5
  states: unlocked/no-pick, unlocked/existing-pick (pre-filled, "Change Pick"), locked/no-results,
  locked/with-results (confirmed the checkmark shows only for the actually-correct prediction,
  not the misses), locked/no-pick-submitted. Note: couldn't test this specific flow against Jay's
  own live Gist (already well past Episode 1), so it was verified entirely with crafted test
  states instead — same rigor, just not on his real data for this one piece.

## Milestone 5 (PWA shell + real design) — started 2026-07-28

**Real cast photos in hand: official Paramount+ "Character Card" art, one per cast member**,
saved to `images/cast/{slug}.webp` (24 files, filenames matched to every `js/seed.js` slug and
verified programmatically — no gaps, no extras). Same exact template across all three teams
(deep navy dusk cityscape/jungle photography, neon blue-to-red diagonal gradient frame, bold
condensed italic display type, the show's own chrome-gradient logo) — this is a real brand,
not team-specific, so it replaced the original plan's more generic "burnt-orange + team colors"
direction. Confirmed with Jay before building anything.

**Design system built, grounded in the real artwork (sampled actual pixel colors, not guessed):**
- `--neon-blue: #1081f5`, `--neon-red: #e21e15`, `--bg-void: #0a0d18` — sampled directly from
  `images/cast/cara-maria.webp`'s border/background via a quick Python/PIL script, not eyeballed.
- Self-hosted `Anton` display font (`fonts/Anton-Regular.woff2`) for `h1`/`h2` — reused directly
  from Jay's Storm project rather than fetching a fresh copy, since he'd already vetted/used it
  there for the same offline-PWA reason.
- `h1` is solid neon-blue with a subtle glow + skew (not gradient-text — tried that first, it
  rendered muddy/purple at this font weight/size, so simplified to solid color for legibility;
  gradient reserved for compact shapes like badges/pills where it reads cleanly).
- The old `--accent-burnt-orange` var is aliased to the new neon-blue rather than ripped out, so
  every existing button/element referencing it updated automatically with no per-call-site edits.

**Cast Browser rebuilt as an actual photo card gallery** (`renderCastBrowser` in
`js/views/player.js`, new `.cast-card`/`.cast-grid` CSS): full character-card art displayed as-is
(not cropped — it's already professionally designed), season points overlaid as a small gradient
badge in the corner that doesn't collide with the baked-in name/logo, status shown as a caption
bar below. Eliminated cast get a CSS `grayscale`+`brightness` filter directly on the `<img>` (no
need to preprocess the source files) — verified live this reads clearly distinct from active
cards at a glance. Responsive: 2 columns phone, 3 tablet, 4 desktop.

**Round 2 of design pass — built 2026-07-28, direct response to Jay's reaction to round 1:**
- Points badge moved from top-right to **bottom-right**, enlarged (1rem &rarr; 1.7rem) — no longer
  crowds the face, reads as a real stat now.
- **Team-color treatment added**: each cast card gets a colored gradient "mat" background + glow
  matching its team (Blue/Orange/Grey — literal team names, so no color-alone ambiguity, doubly
  reinforced by the existing team section headings). Eliminated cards drop the color entirely
  (falls back to plain panel background), reinforcing the "out of the game" read.
- New shared `castCardHtml()` helper in `js/views/shared.js` — same photo-card markup now reused
  by both Cast Browser and **My Roster**, which was rebuilt from a plain text roster list into
  the same photo-card grid (phase-aware logic unchanged, only the visual roster display changed).
- **Leaderboard completely redesigned and repositioned**: was a plain table sitting near the
  bottom of the player sections (right before Commissioner) — Jay felt that was buried and not
  visual enough. Now it's a ranked card list (big rank numeral, name, a relative-standing
  progress bar, gradient-text grand total) at the **top** of the page, right after identity —
  matches how people actually want to use a fantasy app (check standings first). Gradient text
  works cleanly here (short 2-4 digit numbers) even though it read muddy on the long `h1` string —
  confirms that was a length/weight issue, not a fundamental problem with gradient text.
- **Removed the "Raw state.json" and "Computed leaderboard" debug dumps entirely** — Jay asked
  directly whether they were still needed; agreed they were pure Milestone-1 debugging scaffolding
  now that real views exist for everything they showed. Removed from `index.html` and `app.js`
  (including the now-unused `computeLeaderboard` import there).
- Added a `.gitignore` (`.DS_Store`) — hadn't existed before, a stray Finder file had shown up as
  untracked.

**Round 3 — built 2026-07-28, direct response to Jay's reaction to round 2:**
- **Cast Browser, Preseason Bonus Pick, and Safe Pick are now closed-by-default accordions**
  (native `<details>`/`<summary>`, styled to match the `h2` look with a `+`/`−` indicator) — Jay's
  reasoning: these are "look them up when you want them," not primary flow, so they shouldn't
  sit open and take up scroll space by default. Leaderboard/My Roster stay always-open (primary).
- **Preseason Bonus Pick now shows position-labeled cards** (same `castCardHtml` card art, "1st
  Place"/"2nd Place"/"3rd Place" as the status text, a correctness mark once results are known)
  above the existing dropdowns — dropdowns unchanged, cards are a preview/confirmation layer.
- **Safe Pick completely rebuilt as a tap-to-pick card grid** covering the full 24-cast roster,
  smaller cards (new `.cast-grid.compact` — 3/4/6 columns by breakpoint) with four distinct
  states, confirmed with Jay before building the trickiest one:
  - **Available** — normal card, team-color glow, tappable (click submits immediately as this
    week's pick — no separate confirm step, consistent with how quick every other action in this
    app already is; flagging in case Jay wants a confirm step added after using it for real).
  - **This week's own (undecided) pick** — blue "chosen" outline, distinct from both outcomes below.
  - **Used previously, survived that week (hit)** — green glow, green badge showing the points,
    "Week N — Hit!" status.
  - **Used previously, eliminated that week (miss)** — grayscale image, red badge showing 0,
    "Week N — Miss" status. Confirmed with Jay this needed to read distinctly from "eliminated,
    never used" (below), not just reuse the same greyscale-only treatment.
  - **Eliminated, never used** — same greyscale treatment as everywhere else, "Eliminated" status.
- **Bug fixed while extending the shared card helper for these new states:** `.cast-card.active`
  had been dead CSS since an earlier refactor dropped the class that triggered it — cards were
  silently missing their intended blue "ACTIVE" status-bar color. Fixed as part of adding the
  `extraClass` parameter `castCardHtml()` needed for the new Safe Pick states, verified visually.
- All three new states (hit/miss/eliminated-unused) plus the chosen-pick outline verified
  together in one live screenshot before calling this done, not just checked in isolation.

**PWA shell — built and verified 2026-07-29 (commit `9dbc874`):**
- Jay supplied the real official show logo (`images/logo.jpg`, "THE CHALLENGE CUTTHROAT"
  chrome/neon wordmark, 669×267) after being asked to confirm an icon concept first — this
  replaced the plan to build an invented icon from scratch. The wordmark is now the in-app header
  (`<h1><img id="site-logo" ...></h1>`), same "use the real asset directly" pattern as Storm's
  wordmark header.
- **App icons generated from the logo's own sampled colors, not guessed or hand-picked:**
  `images/logo.jpg` is a wide wordmark (2.5:1) that can't crop into a legible square icon (tried —
  any square crop just chops the text mid-letter and reads as broken, not branded, the exact
  aspect-ratio problem Storm hit with its own wordmark). Instead, median-cut color quantization on
  the actual JPEG pulled out its real palette (chrome silver `#b2bbc8`/`#88869a`, neon red-orange
  `#c03d2b`, dark maroon shadow `#441f23`, cyan glow `#86c0db`), and a `"C42"` monogram (Anton
  font, chrome-to-red vertical gradient text, navy-to-maroon background, thin cyan glow bar
  echoing the logo's own underline) was built in Python/PIL using those exact values. Icon concept
  was proposed to Jay first via `AskUserQuestion` before building (he redirected to "use the real
  logo" mid-question, which led to this approach instead of any of the original options).
- Files: `manifest.webmanifest` (name/icons/theme-color, `display: standalone`), `icons/` (192 +
  512 in both `any` and `maskable` purpose, plus a 180px `apple-touch-icon.png`), `sw.js`.
- **`sw.js` caching strategy — same split as Storm's service worker:** HTML/JS
  (`NETWORK_FIRST_FILES`) always hit the network first since this app is under active development
  and must reflect a fresh deploy immediately; fonts/images/icons (`CACHE_FIRST_FILES`) are
  cache-first for offline reliability. Gist API calls (`api.github.com`, cross-origin) and all
  non-GET requests are explicitly excluded from the fetch handler — this app's live sync protocol
  must never be intercepted by the cache.
- **Verified live, not just read through:** installed Playwright + headless Chromium (same method
  as the earlier PDF.js debugging in the Accelerate Playbook project), confirmed manifest is valid
  JSON, all assets 200, service worker reaches `active` state, zero console errors, and — the
  actual point of a service worker — a full page reload with the network cut off still renders
  the shell and logo correctly from cache.

**Identity/admin UI hardened — 2026-07-29, direct response to Jay's reaction to the PWA-shell
screenshot:**
- **Logo resized and centered** (was accidentally left as an oversized full-width image; now
  200px mobile → 280px desktop, centered via `h1 { text-align:center }` + `inline-block` sizing).
- **"Playing as X" text removed entirely** — Jay pointed out the leaderboard already shows this
  via the highlighted current-manager row (`.lb-row.you`), so it was redundant.
- **Identity switch is now a fully hidden triple-tap/triple-click on the logo itself** (within an
  800ms window), replacing the small "not you?" text link from earlier the same day, which was
  itself a step down from the original full-size "Switch" button — this was Jay's explicit ask to
  hide it *more*, not just make it smaller. No visual affordance at all (no cursor change, no
  hover state) — deliberately a secret gesture, not a discoverable control. Bound once per logo
  element via a `dataset.switchBound` flag so the listener doesn't stack across re-renders (this
  app re-renders the player view on every state update). Verified directly: 2 taps don't trigger
  it, the 3rd does exactly once even when the render function is called twice in a row (simulating
  a re-render), and the counter correctly resets after the timeout window.
- **Seed Initial Data / Force Reload moved from the public pre-login area into the password-gated
  Commissioner panel.** Real risk found while reviewing this, not just tidiness: "Seed Initial
  Data" unconditionally overwrites the entire Gist with a blank season (only gated by a fresh
  password *prompt*, not a check for existing data) and was sitting in the open, reachable by
  anyone on any device before commissioner login — with a live season in progress, one accidental
  tap would have wiped everything. Force Reload is harmless (read-only re-fetch) but was moved
  alongside it since it's equally a power-user/debug action, not something the family needs. A
  warning line was added next to the Seed button as a reminder of what it actually does.

**Brand/color alignment pass — 2026-07-29, prompted by Jay adding `images/reference/` (4 jpgs:
the official key art poster + two logo/background shots + one stylistically-different fan-art
cover) and asking for a direct comparison against the app's look and feel.**
- Sampled actual pixel colors from all four references (median-cut quantization + targeted
  crops on the logo glow) rather than eyeballing. Findings: the neon-blue/neon-red accent colors
  already matched the real logo's glow accurately — no change needed there. The one real
  mismatch was the flat solid `--bg-void` background; every reference showed a moody dusk
  *gradient* (cool blue fading through warm plum/maroon), never a flat single dark color. The
  4th reference (bold flat-color "CUTTHROAT 2" cover) was a different, more cartoonish style
  than the photographic mood everything else (including the existing cast cards) shares, so it
  was treated as a stylistic outlier and not pulled from.
- **First attempt: a dusk-glow gradient behind the header, two iterations.** v1 was a
  page-length-relative gradient — too subtle to register and barely visible without scrolling
  most of the way down a long page. v2 was a proper `.hero` container (sized to its own content,
  not a page-relative percentage or an arbitrary pixel height) with a more saturated navy-to-rose
  gradient, ending cleanly right after the tagline. **Both were tried live and Jay rejected the
  whole direction** — reverted `index.html` to be byte-identical to the pre-gradient commit
  (`a7acae5`), confirmed via `git diff`.
- **Second attempt: iterating a flat solid color instead, no gradient.** Landed via three rounds
  of live-verified passes: `#0a0d18` (original, "too flat/black") &rarr; `#182444` (lighter navy,
  "too light") &rarr; **final: `#11182e`, the midpoint between those two** (`--bg-panel` moved in
  step, `#131a2c` &rarr; `#1a2441`, keeping panels a shade lighter than the page background for the
  same elevation contrast as before). **Confirmed: "I agree this looks great now."**
- Lesson worth remembering: Jay's brand/color feedback here converged fastest once gradients
  were off the table entirely — a flat color he could react to in one or two rounds, versus a
  gradient that took two builds and still got rejected outright. Default to a flat color first
  for this kind of "does it match the reference" ask; only reach for a gradient if he asks for
  one directly.

## Evening session — 2026-07-29 (same day, after the brand/color pass above)

Jay's framing for this whole session: get the app ready to hand to the family before Saturday's
draft, ideally tonight. Everything below is built, live-verified, committed, and pushed.

- **Preseason Mode (`c2d2406`).** Before the commissioner has ever run the preseason draft
  (`!state.drafts.preseason`), the player view hides Leaderboard/My Roster/Safe Pick entirely and
  leads with a countdown to draft night (`renderCountdown`, ticks live, targets Aug 1 8:30pm
  local time) plus Cast Browser forced open (normally closed-by-default). Winter Circle (see
  rename below) stays visible since it's genuinely usable pre-draft. Verified live both directions
  (no-draft-yet state and draft-already-started state) with zero console errors.
- **Cast bio modal (`c2d2406`), new `js/bios.js`.** Tapping a Cast Browser card opens a modal:
  age, hometown, origin show, Challenge-season history, and a storyline blurb, cross-referenced
  from two independent public sources (bracketology.tv for the structured fields, goldderby.com
  for the blurb) rather than trusting one — matched against every `seed.js` slug, no gaps. No
  occupation field (neither working source had it; a third, TVInsider, 403'd). Scoped to Cast
  Browser only — Safe Pick and My Roster reuse the same card markup but tapping those already
  submits/selects something, so a bio-modal trigger there would collide.
- **Safe Pick reverted from tap-to-submit back to dropdown + Submit (`6985e17`).** Jay's concern:
  a stray tap on the card grid submitted a pick immediately with zero confirmation. The card grid
  stays as a visual reference (dimmed eliminated, hit/miss coloring, chosen outline) but is no
  longer clickable — only the dropdown + Submit button actually commits, same two-step pattern as
  My Roster. (The card density increase from earlier in the day — 4/5/8 columns — is unaffected.)
- **Concurrent-write test, run against a real (scratch, since-revoked) Gist.** Two races: (1) the
  same manager submitting two simultaneous picks for the same slot — exactly one landed, the loser
  got the clean "not your turn anymore" error, final state stayed valid JSON; (2) the real
  next-in-line manager vs. an "impostor" firing at the same instant — real manager succeeded,
  impostor cleanly rejected. **One non-blocking observation:** the losing request takes ~3-3.6
  seconds to surface its error (the built-in 3-retry backoff working as designed) — a real UX
  latency point if it ever bothers Jay in practice, not a correctness bug.
- **Preseason draft self-service picking (`75cd9d7`) — the big one.** Jay had assumed the
  preseason draft worked like the weekly redraft (pick from your own device on your turn); it
  didn't — Milestone 3 built it commissioner-only, before Milestone 4 introduced self-service for
  weekly redraft, and nobody revisited preseason afterward. Fixed: My Roster now shows a real
  "It's your turn!" pick form for the preseason draft too, using the exact same turn-enforcement
  pattern as weekly redraft (`flattenDraftBoard`, re-verified against fresh state inside the
  mutation). **The Commissioner panel's manual preseason-draft entry stays as a backup** for
  anyone who can't get to the app live — same dual-entry pattern weekly redraft already has, not
  a replacement for it. Verified end-to-end against the real scratch Gist: clicked the actual
  "Start Preseason Draft" button, confirmed the real shuffled round-1 order, confirmed the correct
  manager saw the pick form while others saw "waiting on X," submitted a real pick through the UI,
  confirmed turn correctly advanced.
- **Snake vs. straight draft boards — confirmed still correct, untouched.** Preseason draft uses
  a snake board (`buildDraftBoard`), weekly redraft uses straight (`buildStraightBoard`) — Jay
  asked to confirm this distinction was understood; it was, and the new self-service picker is
  agnostic to board shape (just flattens whatever board array it's given), so this didn't need
  any change. See "Redraft mechanic" below for why they deliberately differ.
- **"Preseason Bonus Pick" renamed to "Winter Circle" (`e613460`), display text only** — internal
  names (`renderPreseasonBonusPick`, `PRESEASON_BONUS_POINTS`, `preseasonPicks` state field,
  `bonus-pick-container` id) are unchanged, only user-facing copy in `index.html`/`player.js`/
  `app.js`'s error message.
- **Cast Browser moved above Winter Circle (`e613460`)** in page order.
- **Commissioner section gated to Jay's identity only (`e613460`).** Previously the password
  unlock form (and, once entered, the panel) was visible to every device regardless of identity —
  just practically inaccessible without the password. Now the whole section (`<h2>Commissioner
  </h2>` + unlock form + panel) is hidden entirely unless `currentManagerId === 'jay'`, checked
  independently of the in-memory `unlocked` flag so switching identity away from Jay on the same
  device hides it immediately even if it was previously unlocked in that session.

## Pre-reset double-check, the reset itself, and post-reset polish — same evening, 2026-07-29

Jay asked to "double check" everything before wiping his real Gist for the actual season — taken
literally, not just a verbal recap.

- **Found and fixed a real bug (`7582e5a`):** tracing the bootstrap code path (not just re-reading
  the Commissioner-gating feature just built) revealed that a genuinely blank Gist would have no
  way to reach the Seed button — `renderPlayerView` (which reveals Commissioner for Jay) never
  runs until `state.managers` exists, but managers only come to exist via Seed, which lives inside
  that same gated section. Didn't block Jay's actual reset (his Gist already had managers from
  the test season) but would have broken any future from-scratch setup. Fixed: `render()` now
  shows Commissioner whenever `state.managers` doesn't exist yet; `renderPlayerView`'s identity
  gating takes over normally once real data exists.
- **Full end-to-end verification against the REAL deployed site** (not localhost), using a
  scratch Gist seeded to mirror Jay's actual starting condition (existing managers + known
  password): real connect form → real unlock → real Seed button click → Preseason Mode confirmed
  → bio modal → real Start Preseason Draft button → real shuffled first picker saw the
  self-service form and submitted a real pick → Winter Circle/Cast Browser order confirmed →
  Safe Pick confirmed dropdown-only → Commissioner confirmed Jay-only. **22/22 checks passed,
  zero console errors**, before Jay reset his own Gist.
- **Jay reset his real Gist.** Preseason Mode confirmed live and correct on his actual device:
  countdown + Cast Browser only, everything else correctly hidden. The mid-season test data
  described elsewhere in this file is gone — this is the real season now.
- **Post-reset polish, same evening (`aea0820`):** Jay's first live reaction to Preseason Mode —
  loved it, three small asks. Cast Browser had zero instructional text — added a short intro.
  Winter Circle's three prediction dropdowns were unlabeled — added "1st Place"/"2nd Place"/"3rd
  Place" labels (required a small CSS fix: `.control-row`'s responsive sizing targeted direct
  `select`/`input` children, so wrapping selects in `<label>` needed `.control-row > label` added
  to the same rule). Checked, not changed: the locked-state position labels under a submitted
  Winter Circle pick were already built earlier the same evening (`bonusPickCardsHtml`) — Jay
  asked for this without realizing it existed; verified live, no code change needed. Also
  checked: Safe Pick's directions text was already adequate.

## Punch list cleared out — same evening, 2026-07-29 (`0145a21`, `2e03116`)

Jay told me directly to stop asking "what's next" each time and just build through the remaining
list myself until it was empty. Both remaining items are now done:

- **Redraft-twist reveal toggle — built, turned out to be a real gap, not busywork.** The
  "deferred, no consumer yet" reasoning from earlier notes was stale: My Roster's self-service
  weekly redraft UI (turn indicators, "waiting on X's pick") was already showing the moment Week 2
  opened, which would have spoiled the season's one twist before Jay's planned reveal right after
  Episode 1. Added a Commissioner-only "Reveal Redraft Twist to Family" toggle (confirm-gated,
  same pattern as Freeze Rosters) that flips `meta.redraftTwistRevealed`. Until flipped, My Roster
  shows a neutral "Your Roster" view with no hint of the mechanic. The preseason draft's
  self-service picking is untouched — not part of the twist. Verified against a real Gist: a
  secretly-open Week 2 redraft leaked nothing pre-reveal, the real button correctly flipped the
  flag, the real turn-based UI appeared immediately after.
- **Commissioner panel visual design pass** — deliberately lighter-touch than the player-facing
  rounds (function-first, Jay-only, used during live fast-moving events where scan speed beats
  photo-card richness). Grouped each sub-section into a distinct panel for scannability, and gave
  the destructive Seed Initial Data button a red danger color instead of matching every routine
  blue button — a real safety improvement given what that button does. A console error surfaced
  during verification (`board: []` test fixture, not a real app bug — `buildDraftBoard` never
  actually returns an empty array) was traced and ruled out before shipping.

**The "not done yet" list is now empty.** Nothing outstanding — waiting on Jay to raise the next
thing.

## Jay's real end-to-end testing session — same night, 2026-07-29 late / 2026-07-30 early

Jay started testing the real live season: pre-draft, the actual preseason draft, and Episode 1
scoring, all on his real Gist (not a test one). Three things came out of it, all shipped:

- **Confessional minutes replaced with a count + most-confessionals bonus (`3d0e355`).** Jay
  asked how confessional minutes were scored — checked the code and the plan doc directly and
  confirmed they never scored anything at all, just a tracked stat. His fix: track a count
  instead of minutes, +5 points to whoever has the most confessionals in an episode (ties all
  get it). Implemented as just another `SCORING_EVENT_POINTS` entry (`CONFESSIONAL`, worth 0
  direct points) logged through the existing Add Event UI — the old dedicated minutes
  field/form/handler were removed outright.
- **Season Status banner added above the Leaderboard (`509ac61`).** Jay noticed that after
  Episode 1 was scored, nothing in the app said what was happening or what's next. Built a
  single always-current status line covering 8 phases, respecting the same twist-secrecy rule as
  My Roster (vague pre-reveal, specific after). **Jay had not yet hit "Reveal Redraft Twist" as
  of this session — still his pending next move.**
- **GitHub API rate limit hit and partially fixed (`a928615`).** Jay's real account hit the
  5,000 req/hour ceiling — likely because the scratch Gist token from earlier this session drew
  from the same account-level budget as his real usage (GitHub rate-limits per account, not
  per-token). No data lost, resets automatically. Found and fixed a real inefficiency while
  investigating: `runMutation` was fetching state a redundant third time after every successful
  save; fixed to use `commitMutation`'s already-confirmed return value directly, cutting every
  save from 4 API requests to 3.

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

## Commissioner "Reminders" block added — 2026-07-31 (`67440ad`, `dbd8792`)

Jay asked about push notifications for nudging the family about missed Safe Picks / stalled
drafts. Real Web Push needs actual server-side infrastructure (scheduled job, subscription
storage, signing keys) that this app deliberately doesn't have — too big for what he actually
needed. Built a much smaller "Reminders" block in the Commissioner panel instead (top, right
after Data Sync): two buttons that compute who's missing from real Gist data and copy a
ready-to-paste message to the clipboard — Jay pastes it into his own existing group chat, nothing
sends automatically, no phone numbers stored.

- **Copy Safe Pick Reminder** — names every active manager who hasn't submitted the currently-open
  week's Safe Pick (`nextEpisodeNumber(state)`, same calculation the player-facing Safe Pick view
  already uses).
- **Copy Turn Reminder** — names whoever's currently holding up a turn-based pick, covering both
  the preseason draft and weekly redraft with one button (both are structurally identical —
  exactly one manager is "up" at a time).
- Both disable themselves when there's nothing to remind about. Pure read + clipboard — never
  touches the Gist, no write-conflict risk.
- Verified live via mocked-Gist Playwright (with clipboard permissions granted) across 4
  scenarios: correct missing-list, correct redraft turn, correct preseason-draft turn (a separate
  code path), correct disabling.

**Real bug Jay caught immediately on his own phone, fixed same session (`dbd8792`):** disabled
buttons had no `:disabled` CSS anywhere in the app, so a disabled button looked 100% identical to
a working one — tapping it did correctly nothing, with zero indication why, reading exactly like
"the app is broken." Fixed with real dimming (`button:disabled { opacity: 0.35 }`, benefits every
disabled button app-wide) plus plain always-visible text explaining the specific reason — a
tooltip was explicitly avoided since it's useless without a mouse/hover on a phone.

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
