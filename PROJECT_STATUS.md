# Project Status — updated 2026-07-29

Fantasy league PWA for MTV's *The Challenge* S42: Cutthroat. Full architecture plan lives at
`/Users/jackerman/.claude/plans/i-m-building-a-fantasy-valiant-ocean.md` on Jay's machine — read
that first for the complete data model, sync strategy, and UI spec.

**Git status: clean and pushed.** Commit `7bf13a9` — final background color pass — on top of
`d78d441`/`9b94023`/`9bf9d8e` (the background color iteration, see below), `9c87f47` (GitHub
Pages enabled + `.nojekyll`), `9dbc874` (PWA shell: manifest, service worker, real logo, generated
icons + identity/admin UI hardening), `0bbb209` (readability refactor), and the Milestone 4
commit `e85f112` (Safe Pick, Cast Browser, Preseason Bonus Pick). No local uncommitted changes as
of this checkpoint (one untracked, unaddressed folder remains — see below).

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

## Not done yet
- **`images/reference/` folder is still untracked in git** (4 jpgs + a `.DS_Store`, added by Jay
  for the brand comparison above). Flagged to him twice, no answer yet on whether to commit it
  as ongoing brand reference or leave it out of the repo. Not blocking anything — just don't
  silently commit or silently delete it either way.
- **Commissioner views are still visually plain** — round 3 covered every player-facing section
  Jay flagged; Commissioner mode (password-gated, only Jay uses it) hasn't had the same design
  pass. Worth asking whether that even needs the same treatment, or whether "boring but
  functional" is fine there since it's power-user tooling, not the family-facing experience.
- **Redraft-twist reveal toggle** — intentionally deferred. Nothing in the app reads
  `meta.redraftTwistRevealed` yet; it only matters once a player view exists to hide/reveal the
  redraft feature from the family, so building the toggle now would be inert.
- Milestone 6 (hardening/deploy) still pending — deploy is now partially done (Pages is live),
  but the concurrent-write test and a full offline test on a real device are still outstanding.
- ~~Not yet tested on a real phone as an actually-installed PWA~~ — **done, confirmed by Jay
  2026-07-29.** Milestone 5's PWA half is now fully verified, not just headless-checked.

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
