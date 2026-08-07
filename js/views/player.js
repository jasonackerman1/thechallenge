// Player-facing views (Milestone 4). Pure rendering — no gist.js/state.js knowledge, same
// pattern as commissioner.js. Player actions have no password gate (unlike commissioner mode) —
// the only "identity" is a per-device manager selection, a convenience, not real auth.

import {
  computeLeaderboard,
  computeEliminationEpisodes,
  computeCastSeasonPoints,
  computeCastPointsBreakdownByWeek,
  getUsedSafePicks,
  SAFE_PICK_POINTS,
  PRESEASON_BONUS_POINTS,
  SCORING_EVENT_LABELS,
} from '../scoring.js';
import { flattenDraftBoard, getAvailableCast, getRosterForManager, isDraftComplete, TARGET_ROSTER_SIZE } from '../draft.js';
import { getCurrentRedraftWeek, nextRedraftWeek, nextEpisodeNumber, getCurrentEpisode, rostersReadyForEpisode } from './commissioner.js';
import { managerName, castName, castNameWithGender, castCardHtml } from './shared.js';
import { CAST_BIOS } from '../bios.js';

/** App-wide "who's using this device" modal — same first-open pattern as the location picker
 *  used elsewhere (auto-opens once if no identity is set, reopenable any time via the small
 *  persistent indicator below). Not scoped to any one view: this identity will matter just as
 *  much to My Roster/Safe Pick/Bonus Pick once those exist, not only the leaderboard. */
export function renderIdentityModal(modalEl, state, { onSetIdentity }) {
  const options = state.managers
    .filter((m) => m.active)
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join('');
  modalEl.innerHTML = `
    <div class="modal-card">
      <h3>Who's using this device?</h3>
      <p style="color:var(--text-muted); font-size:0.85rem;">Picked once per device, so the app
      knows which roster/picks are yours. Not a password — anyone can switch anytime.</p>
      <select id="identity-select">${options}</select>
      <button id="set-identity-btn">This Is Me</button>
    </div>
  `;
  modalEl.querySelector('#set-identity-btn').addEventListener('click', () => {
    onSetIdentity(modalEl.querySelector('#identity-select').value);
  });
}

const TRIPLE_TAP_WINDOW_MS = 800;

/** No visible "Playing as X" text anymore — the leaderboard already highlights the current
 *  manager's row, so it was redundant. The switch trigger itself is now fully hidden: three
 *  taps/clicks on the header logo within a short window reopens the identity modal. No visual
 *  affordance at all (no cursor change, no hover state) — this is deliberately a secret gesture,
 *  not a discoverable control, since a visible "Switch" button (even a small text link) still
 *  invited casual/accidental identity switching. Bound once per logo element via a dataset flag,
 *  since renderPlayerView() re-runs on every state update and would otherwise stack listeners. */
export function renderIdentityIndicator(logoEl, { onSwitch }) {
  if (!logoEl || logoEl.dataset.switchBound) return;
  logoEl.dataset.switchBound = 'true';

  let tapCount = 0;
  let resetTimer = null;
  logoEl.addEventListener('click', () => {
    tapCount += 1;
    clearTimeout(resetTimer);
    if (tapCount >= 3) {
      tapCount = 0;
      onSwitch();
      return;
    }
    resetTimer = setTimeout(() => {
      tapCount = 0;
    }, TRIPLE_TAP_WINDOW_MS);
  });
}

export function renderLeaderboard(container, state, currentManagerId) {
  if (!state.episodes.some((e) => e.finalized)) {
    container.innerHTML = `<p>No episodes finalized yet — the leaderboard fills in once Episode 1 is scored.</p>`;
    return;
  }

  const standings = computeLeaderboard(state);
  const maxTotal = Math.max(1, ...standings.map((s) => s.grandTotal));
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);

  const rowsHtml = standings
    .map((row) => {
      const isYou = row.managerId === currentManagerId;
      const barPct = Math.max(4, Math.round((row.grandTotal / maxTotal) * 100));
      const teamCastIds = currentRosterIds(state, row.managerId);
      const teamText = teamCastIds.length
        ? teamCastIds
            .map((id) =>
              eliminationEpisodes.has(id)
                ? `<span class="lb-team-out">${castName(state, id)}</span>`
                : castName(state, id)
            )
            .join(', ')
        : '(no roster yet)';
      return `
        <div class="lb-row ${isYou ? 'you' : ''} ${row.rank === 1 ? 'rank-1' : ''}">
          <div class="lb-rank">${row.rank}</div>
          <div class="lb-info">
            <div class="lb-name">${row.name}${isYou ? '<span class="you-tag">YOU</span>' : ''}</div>
            <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${barPct}%"></div></div>
            <div class="lb-breakdown">This week +${row.thisWeekRosterPoints} &middot; Safe pick +${row.thisWeekSafePickPoints} &middot; Bonus +${row.bonusPoints}</div>
            <div class="lb-team">Team: ${teamText}</div>
          </div>
          <div class="lb-total">${row.grandTotal}</div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = rowsHtml;
}

/** Whatever roster is currently "in effect" for a manager: the most recently completed weekly
 *  redraft, falling back to the preseason draft if no weekly redraft has happened yet. Used for
 *  read-only display (frozen, or between redrafts) — not for the live in-progress picker. */
function currentRosterIds(state, managerId) {
  const weeks = Object.keys(state.drafts.weekly)
    .map(Number)
    .sort((a, b) => b - a);
  const latestWeek = weeks[0];
  if (latestWeek !== undefined) return getRosterForManager(state.drafts.weekly[String(latestWeek)].picks, managerId);
  if (state.drafts.preseason) return getRosterForManager(state.drafts.preseason.picks, managerId);
  return [];
}

/** Same photo-card treatment as Cast Browser, scoped to just this manager's current roster. */
function rosterCardsHtml(state, castIds) {
  if (!castIds.length) return '<p style="color:var(--text-muted);">(none yet)</p>';
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const seasonPoints = computeCastSeasonPoints(state);
  const cards = castIds
    .map((id) => {
      const eliminatedAt = eliminationEpisodes.get(id);
      const eliminated = eliminatedAt !== undefined;
      const statusText = eliminated ? `Eliminated &mdash; Ep ${eliminatedAt}` : 'Active';
      return castCardHtml(state, id, { points: seasonPoints.get(id) ?? 0, statusText, eliminated });
    })
    .join('');
  return `<div class="cast-grid">${cards}</div>`;
}

/** Non-blocking "aim for the other gender next" nudge, shared by both the preseason draft's
 *  self-service picker and the weekly redraft's — same hint, same wording, two different draft
 *  boards to read the roster-so-far from. */
function genderHintHtml(state, myRoster) {
  if (!state.cast[0]?.gender) return '';
  const genders = myRoster.map((id) => state.cast.find((c) => c.id === id)?.gender);
  const mCount = genders.filter((g) => g === 'M').length;
  const fCount = genders.filter((g) => g === 'F').length;
  const suggestion = mCount <= fCount ? 'a guy' : 'a girl';
  return `<p style="font-size:0.85rem; color:var(--text-muted);">You have ${mCount} guy(s), ${fCount} girl(s) so far &mdash; aiming for ${suggestion} next (not required)</p>`;
}

/** Binds every `.cast-card` currently in `container` to open the stats modal on click — called
 *  after each `container.innerHTML` assignment below, since My Roster has several early-return
 *  branches (frozen, mid-draft, waiting, twist-hidden) rather than one shared render path. */
function bindCastCardClicks(container, onCardClick) {
  if (!onCardClick) return;
  container.querySelectorAll('.cast-card').forEach((card) => {
    card.addEventListener('click', () => onCardClick(card.dataset.castId));
  });
}

export function renderMyRoster(container, state, currentManagerId, { onPick, onPreseasonPick, onCardClick }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to see your roster.</p>`;
    return;
  }

  if (state.meta.rosterFrozen) {
    container.innerHTML = `
      <p><strong>Rosters are frozen for the rest of the season.</strong></p>
      ${rosterCardsHtml(state, currentRosterIds(state, currentManagerId))}
    `;
    bindCastCardClicks(container, onCardClick);
    return;
  }

  // Preseason draft self-service picking — not part of the season's one twist (everyone knows
  // about the initial draft from the start), so this always shows regardless of
  // redraftTwistRevealed below. Same turn-enforcement pattern as the weekly redraft. No
  // eliminations can exist yet this early, so eliminatedCastIds is always empty here (unlike the
  // weekly redraft, which has to account for mid-season exits). The Commissioner panel's manual
  // entry form still exists alongside this as a backup for anyone who can't get to the app live.
  if (state.drafts.preseason && !isDraftComplete(state.drafts.preseason.board, state.drafts.preseason.picks, state.cast.map((c) => c.id), new Set())) {
    const draft = state.drafts.preseason;
    const flat = flattenDraftBoard(draft.board);
    const nextSlot = flat[draft.picks.length];
    const myRoster = getRosterForManager(draft.picks, currentManagerId);

    if (nextSlot.managerId === currentManagerId) {
      const available = getAvailableCast(state.cast.map((c) => c.id), new Set(), draft.picks);
      const castOptions = available.map((id) => `<option value="${id}">${castNameWithGender(state, id)}</option>`).join('');

      container.innerHTML = `
        <p><strong>It's your turn!</strong> Preseason Draft, round ${nextSlot.round + 1} of ${draft.board.length}.</p>
        <h4>Your Roster So Far</h4>
        ${rosterCardsHtml(state, myRoster)}
        ${genderHintHtml(state, myRoster)}
        <div class="control-row">
          <select id="my-preseason-pick-select">${castOptions}</select>
          <button id="my-preseason-pick-btn">Submit Pick</button>
        </div>
      `;
      container.querySelector('#my-preseason-pick-btn').addEventListener('click', () => {
        onPreseasonPick(container.querySelector('#my-preseason-pick-select').value);
      });
    } else {
      container.innerHTML = `
        <p>Preseason Draft is in progress &mdash; waiting on <strong>${managerName(state, nextSlot.managerId)}</strong>'s pick (round ${nextSlot.round + 1} of ${draft.board.length}).</p>
        <h4>Your Roster So Far</h4>
        ${rosterCardsHtml(state, myRoster)}
      `;
    }
    bindCastCardClicks(container, onCardClick);
    return;
  }

  // The season's one twist: nothing past this point (weekly redraft turns, "waiting on Week N"
  // messaging) may hint that a redraft mechanic exists until Jay reveals it — right after
  // Episode 1, via the Commissioner panel's "Reveal Redraft Twist" toggle. Until then, show a
  // deliberately neutral roster view, same for everyone regardless of what's actually happening
  // behind the scenes (an open Week 2 redraft, a finalized Episode 1, etc.).
  if (!state.meta.redraftTwistRevealed) {
    container.innerHTML = `
      <p><strong>Your Roster:</strong></p>
      ${rosterCardsHtml(state, currentRosterIds(state, currentManagerId))}
    `;
    bindCastCardClicks(container, onCardClick);
    return;
  }

  const currentWeek = getCurrentRedraftWeek(state);

  if (currentWeek !== null) {
    const draft = state.drafts.weekly[String(currentWeek)];
    const flat = flattenDraftBoard(draft.board);
    const nextSlot = flat[draft.picks.length];
    const myRoster = getRosterForManager(draft.picks, currentManagerId);

    if (nextSlot.managerId === currentManagerId) {
      const eliminatedCastIds = new Set(computeEliminationEpisodes(state.episodes).keys());
      const available = getAvailableCast(state.cast.map((c) => c.id), eliminatedCastIds, draft.picks);
      const castOptions = available.map((id) => `<option value="${id}">${castNameWithGender(state, id)}</option>`).join('');

      container.innerHTML = `
        <p><strong>It's your turn!</strong> Week ${currentWeek} redraft, round ${nextSlot.round + 1} of ${draft.board.length}.</p>
        <h4>Your Roster So Far</h4>
        ${rosterCardsHtml(state, myRoster)}
        ${genderHintHtml(state, myRoster)}
        <div class="control-row">
          <select id="my-pick-select">${castOptions}</select>
          <button id="my-pick-btn">Submit Pick</button>
        </div>
      `;
      container.querySelector('#my-pick-btn').addEventListener('click', () => {
        onPick(container.querySelector('#my-pick-select').value);
      });
    } else {
      container.innerHTML = `
        <p>Week ${currentWeek} redraft is in progress &mdash; waiting on <strong>${managerName(state, nextSlot.managerId)}</strong>'s pick (round ${nextSlot.round + 1} of ${draft.board.length}).</p>
        <h4>Your Roster So Far</h4>
        ${rosterCardsHtml(state, myRoster)}
      `;
    }
    bindCastCardClicks(container, onCardClick);
    return;
  }

  const week = nextRedraftWeek(state);
  const prevEpisode = state.episodes.find((e) => e.episodeNumber === week - 1);
  const roster = currentRosterIds(state, currentManagerId);

  if (!state.drafts.preseason) {
    container.innerHTML = `<p>Waiting on the commissioner to run the preseason draft.</p>`;
  } else if (week === 2 && (!prevEpisode || !prevEpisode.finalized)) {
    container.innerHTML = `
      <p><strong>Your Week 1 roster (locked in until Episode 1 is finalized):</strong></p>
      ${rosterCardsHtml(state, roster)}
    `;
  } else if (!prevEpisode || !prevEpisode.finalized) {
    container.innerHTML = `
      <p>Waiting on Episode ${week - 1} to be finalized before the Week ${week} redraft opens.</p>
      ${rosterCardsHtml(state, roster)}
    `;
  } else {
    container.innerHTML = `
      <p>Waiting on the commissioner to open the Week ${week} redraft.</p>
      ${rosterCardsHtml(state, roster)}
    `;
  }
  bindCastCardClicks(container, onCardClick);
}

/** Every cast member this manager has ever safe-picked, with the outcome once that week's
 *  episode is finalized (undecided if the pick is this week's still-open one). */
function mySafePickOutcomes(state, managerId) {
  const outcomes = new Map();
  for (const [weekStr, picks] of Object.entries(state.safePicks ?? {})) {
    const pick = picks.find((p) => p.managerId === managerId);
    if (!pick) continue;
    const week = Number(weekStr);
    const episode = state.episodes.find((e) => e.episodeNumber === week);
    const decided = !!episode?.finalized;
    const eliminatedThisWeek = decided && (episode.eliminations ?? []).some((e) => e.castId === pick.castId);
    outcomes.set(pick.castId, { week, decided, success: decided && !eliminatedThisWeek });
  }
  return outcomes;
}

export function renderSafePick(container, state, currentManagerId, { onSubmitSafePick, onClearSafePick }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to make a safe pick.</p>`;
    return;
  }

  const week = nextEpisodeNumber(state);
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const outcomes = mySafePickOutcomes(state, currentManagerId);
  const existingPick = (state.safePicks?.[String(week)] ?? []).find((p) => p.managerId === currentManagerId);
  const seasonPoints = computeCastSeasonPoints(state);

  // Two-step dropdown + Submit, not tap-to-pick: a stray tap on the card grid used to submit a
  // safe pick immediately with no confirmation, which Jay flagged as too easy to fat-finger.
  // The card grid below stays purely visual (status/dimming reference) — the dropdown is the
  // only thing that actually submits.
  const usedCastIds = getUsedSafePicks(state, currentManagerId);
  if (existingPick) usedCastIds.delete(existingPick.castId);
  const availableOptions = state.cast
    .filter((c) => !eliminationEpisodes.has(c.id) && !usedCastIds.has(c.id))
    .map((c) => `<option value="${c.id}" ${existingPick?.castId === c.id ? 'selected' : ''}>${castNameWithGender(state, c.id)}</option>`)
    .join('');

  const cardsHtml = state.cast
    .map((c) => {
      const isCurrentPick = existingPick?.castId === c.id;
      const outcome = outcomes.get(c.id);
      const eliminated = eliminationEpisodes.has(c.id);

      if (outcome?.decided && !isCurrentPick) {
        return outcome.success
          ? castCardHtml(state, c.id, { points: SAFE_PICK_POINTS, statusText: `Week ${outcome.week} &mdash; Hit!`, extraClass: 'sp-success' })
          : castCardHtml(state, c.id, { points: 0, statusText: `Week ${outcome.week} &mdash; Miss`, extraClass: 'sp-miss' });
      }
      if (eliminated && !isCurrentPick) {
        return castCardHtml(state, c.id, { points: seasonPoints.get(c.id) ?? 0, statusText: 'Eliminated', eliminated: true });
      }
      const statusText = isCurrentPick ? `Week ${week} Pick` : castNameWithGender(state, c.id);
      return castCardHtml(state, c.id, { points: seasonPoints.get(c.id) ?? 0, statusText, extraClass: isCurrentPick ? 'sp-chosen' : '' });
    })
    .join('');

  container.innerHTML = `
    <p>Pick who you think survives Week ${week}'s episode from the dropdown below, then hit Submit &mdash;
    +${SAFE_PICK_POINTS} points if they do. Each cast member can only be used once all season, and this locks
    the moment the commissioner starts entering Week ${week}'s results.</p>
    ${existingPick ? `<p><strong>Current pick:</strong> ${castName(state, existingPick.castId)} <button id="safe-pick-clear-btn" class="btn-inline" style="background:#7a2020;">Clear</button></p>` : ''}
    <div class="control-row">
      <select id="safe-pick-select">${availableOptions}</select>
      <button id="safe-pick-submit-btn">Submit</button>
    </div>
    <div class="cast-grid compact">${cardsHtml}</div>
  `;

  container.querySelector('#safe-pick-submit-btn').addEventListener('click', () => {
    onSubmitSafePick(container.querySelector('#safe-pick-select').value);
  });
  container.querySelector('#safe-pick-clear-btn')?.addEventListener('click', onClearSafePick);
}

/** Locks the moment Episode 1 is finalized — a one-time prediction, not a weekly action. */
export function isPreseasonBonusPickLocked(state) {
  return state.episodes.some((e) => e.episodeNumber === 1 && e.finalized);
}

/** Position-labeled cards for a submitted pick — same card art as everywhere else, with the
 *  predicted-position label (and a correctness mark once results are known) as the status. */
function bonusPickCardsHtml(state, pick) {
  if (!pick) return '';
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const seasonPoints = computeCastSeasonPoints(state);
  const resultsKnown = state.finalChallenge?.completed;
  const slots = [
    { label: '1st Place', castId: pick.first, actual: state.finalChallenge?.winner },
    { label: '2nd Place', castId: pick.second, actual: state.finalChallenge?.second },
    { label: '3rd Place', castId: pick.third, actual: state.finalChallenge?.third },
  ];
  const cards = slots
    .map(({ label, castId, actual }) => {
      const hit = resultsKnown && castId === actual;
      const statusText = resultsKnown ? `${label} ${hit ? '&#10003; correct' : ''}` : label;
      return castCardHtml(state, castId, { points: seasonPoints.get(castId) ?? 0, statusText, eliminated: eliminationEpisodes.has(castId) });
    })
    .join('');
  return `<div class="cast-grid">${cards}</div>`;
}

export function renderPreseasonBonusPick(container, state, currentManagerId, { onSubmit }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to make your Winter Circle pick.</p>`;
    return;
  }

  const existingPick = (state.preseasonPicks ?? []).find((p) => p.managerId === currentManagerId);
  const locked = isPreseasonBonusPickLocked(state);

  if (locked) {
    if (!existingPick) {
      container.innerHTML = `<p>Winter Circle picks are locked (Episode 1 is finalized). You didn't submit one.</p>`;
      return;
    }
    container.innerHTML = `
      <p><strong>Your Winter Circle pick (locked):</strong></p>
      ${bonusPickCardsHtml(state, existingPick)}
    `;
    return;
  }

  const castOptions = (selected) =>
    state.cast
      .map((c) => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${castNameWithGender(state, c.id)}</option>`)
      .join('');

  container.innerHTML = `
    <p>Predict the season's top 3 finishers. Points if you're right: 1st +${PRESEASON_BONUS_POINTS.first},
    2nd +${PRESEASON_BONUS_POINTS.second}, 3rd +${PRESEASON_BONUS_POINTS.third}. Locks the moment Episode 1 is finalized.</p>
    ${existingPick ? `<p><strong>Current pick:</strong></p>${bonusPickCardsHtml(state, existingPick)}` : ''}
    <div class="control-row">
      <label>1st Place<select id="bonus-first-select">${castOptions(existingPick?.first)}</select></label>
      <label>2nd Place<select id="bonus-second-select">${castOptions(existingPick?.second)}</select></label>
      <label>3rd Place<select id="bonus-third-select">${castOptions(existingPick?.third)}</select></label>
    </div>
    <button id="bonus-submit-btn">${existingPick ? 'Change Pick' : 'Submit Winter Circle Pick'}</button>
  `;

  container.querySelector('#bonus-submit-btn').addEventListener('click', () => {
    const first = container.querySelector('#bonus-first-select').value;
    const second = container.querySelector('#bonus-second-select').value;
    const third = container.querySelector('#bonus-third-select').value;
    if (new Set([first, second, third]).size < 3) {
      alert('1st, 2nd, and 3rd must be three different cast members.');
      return;
    }
    onSubmit({ first, second, third });
  });
}

/** A single always-current sentence summarizing where the season stands right now — shown above
 *  the Leaderboard so the family always has one clear place to check "what's happening / what's
 *  next" instead of piecing it together from individual sections. Respects the same
 *  twist-secrecy rule as My Roster (vague before Jay reveals the redraft twist, specific after).
 *  Returns null (renders nothing) during phases already covered vividly elsewhere: Preseason
 *  Mode has its own countdown, and the preseason/weekly draft's own live turn-based UI in My
 *  Roster already shows who's up. */
export function computeSeasonStatusText(state) {
  if (
    !state.drafts.preseason ||
    !isDraftComplete(state.drafts.preseason.board, state.drafts.preseason.picks, state.cast.map((c) => c.id), new Set())
  ) {
    return null;
  }
  if (state.finalChallenge?.completed) {
    return '\u{1F3C6} The season is over! Check the leaderboard for final results.';
  }
  if (state.meta.rosterFrozen) {
    return 'Rosters are frozen for the rest of the season — no more redrafts. Watch for the Final Challenge!';
  }
  const currentEpisode = getCurrentEpisode(state);
  if (currentEpisode) {
    return `Episode ${currentEpisode.episodeNumber} is airing — the commissioner will score it once results are in.`;
  }
  if (state.episodes.length === 0) {
    return 'The draft is complete — Episode 1 coming soon!';
  }
  const lastFinalized = state.episodes[state.episodes.length - 1];
  if (!state.meta.redraftTwistRevealed) {
    return `Episode ${lastFinalized.episodeNumber} is scored — stay tuned for what's next!`;
  }
  const currentWeek = getCurrentRedraftWeek(state);
  if (currentWeek !== null) {
    return `Week ${currentWeek} redraft is live — check My Roster if it's your turn!`;
  }
  const nextEp = nextEpisodeNumber(state);
  if (rostersReadyForEpisode(state, nextEp)) {
    return `Rosters are set for Week ${nextEp} — waiting on the commissioner to start Episode ${nextEp}.`;
  }
  return `Episode ${lastFinalized.episodeNumber} is scored — waiting on the commissioner to open the Week ${nextEp} redraft.`;
}

export function renderSeasonStatus(container, state) {
  const text = computeSeasonStatusText(state);
  container.innerHTML = text ? `<div class="season-status-banner">${text}</div>` : '';
}

/** Preseason Mode countdown to draft night. Target is a fixed real-world moment (Aug 1, 2026,
 *  8:30pm), parsed as each viewer's own local time — fine since the whole family is in the same
 *  timezone; revisit if that stops being true. Runs its own setInterval since it's the only view
 *  here that needs to tick on its own rather than re-rendering only on state changes. */
const DRAFT_COUNTDOWN_TARGET = new Date('2026-08-01T20:30:00');
let countdownIntervalId = null;

export function renderCountdown(container) {
  if (countdownIntervalId) clearInterval(countdownIntervalId);

  function tick() {
    const diff = DRAFT_COUNTDOWN_TARGET.getTime() - Date.now();
    if (diff <= 0) {
      container.innerHTML = `<div class="countdown-card"><div class="countdown-label">It's Draft Night!</div></div>`;
      clearInterval(countdownIntervalId);
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    container.innerHTML = `
      <div class="countdown-card">
        <div class="countdown-label">Countdown to Draft Night</div>
        <div class="countdown-clock">
          <div><span>${days}</span><small>Days</small></div>
          <div><span>${hours}</span><small>Hrs</small></div>
          <div><span>${minutes}</span><small>Min</small></div>
          <div><span>${seconds}</span><small>Sec</small></div>
        </div>
      </div>`;
  }

  tick();
  countdownIntervalId = setInterval(tick, 1000);
}

export function renderCastBrowser(container, state, { onCardClick } = {}) {
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const seasonPoints = computeCastSeasonPoints(state);
  const teams = [...new Set(state.cast.map((c) => c.team))];

  const sectionsHtml = teams
    .map((team) => {
      const cards = state.cast
        .filter((c) => c.team === team)
        .map((c) => {
          const eliminatedAt = eliminationEpisodes.get(c.id);
          const eliminated = eliminatedAt !== undefined;
          const statusText = eliminated ? `Eliminated &mdash; Ep ${eliminatedAt}` : 'Active';
          return castCardHtml(state, c.id, { points: seasonPoints.get(c.id) ?? 0, statusText, eliminated });
        })
        .join('');
      return `<h4>${team}</h4><div class="cast-grid">${cards}</div>`;
    })
    .join('');

  container.innerHTML = `
    <p>Browse the full cast by team. Tap a card for their bio and Challenge history. The number
    on each card is their season point total so far. Eliminated cast are grayed out.</p>
    ${sectionsHtml}
  `;

  if (onCardClick) {
    container.querySelectorAll('.cast-card').forEach((card) => {
      card.addEventListener('click', () => onCardClick(card.dataset.castId));
    });
  }
}

/** Week-by-week points breakdown for the stats modal — one block per finalized episode, each
 *  line showing which event scored it and its subtotal (e.g. "Confessional x3: +15"), plus the
 *  Survived-the-Week bonus when earned. Updates automatically as new episodes are finalized,
 *  since it's computed fresh from computeCastPointsBreakdownByWeek rather than stored. */
function castStatsHtml(state, castId) {
  const weeks = computeCastPointsBreakdownByWeek(state, castId);
  if (!weeks.length) return `<p class="bio-meta">No episodes scored yet.</p>`;
  const weekBlocks = weeks
    .map((w) => {
      const eventLines = w.events
        .map((e) => {
          const label = SCORING_EVENT_LABELS[e.type] ?? e.type;
          const countText = e.count > 1 ? ` x${e.count}` : '';
          return `<li>${label}${countText}: ${e.points >= 0 ? '+' : ''}${e.points}</li>`;
        })
        .join('');
      const survivedLine = w.survivedBonus ? `<li>Survived the week: +${w.survivedBonus}</li>` : '';
      const emptyLine = !w.events.length && !w.survivedBonus ? `<li class="stats-none">Nothing logged</li>` : '';
      return `
        <div class="stats-week">
          <div class="stats-week-header">Week ${w.week} <span>${w.total >= 0 ? '+' : ''}${w.total} pts</span></div>
          <ul>${eventLines}${survivedLine}${emptyLine}</ul>
        </div>
      `;
    })
    .join('');
  return `<div class="stats-breakdown"><h4>Weekly Stats</h4>${weekBlocks}</div>`;
}

/** Bio + stats modal — opens from both Cast Browser and My Roster cards (Safe Pick/Preseason
 *  Bonus Pick still reuse the same card markup without a click handler, since tapping those
 *  already submits a pick). Bio half is static reference content in bios.js; stats half is
 *  computed fresh every open, so it updates automatically as new episodes get finalized.
 *  Backdrop-click-to-close is bound once via a dataset flag since modalEl itself persists
 *  across renders (only its innerHTML is replaced) — same guard pattern as the identity
 *  triple-tap binding. */
export function renderCastBioModal(modalEl, state, castId) {
  const cast = state.cast.find((c) => c.id === castId);
  const bio = CAST_BIOS[castId];
  modalEl.innerHTML = `
    <div class="modal-card bio-card">
      <button id="bio-close-btn" class="bio-close" aria-label="Close">&times;</button>
      <img src="images/cast/${castId}.webp" alt="${cast?.name ?? castId}" class="bio-photo" />
      <h3>${bio?.fullName ?? cast?.name ?? castId}</h3>
      ${bio
        ? `
          <p class="bio-meta">${bio.age} &middot; ${bio.hometown}</p>
          <p class="bio-meta">${bio.origin} &mdash; ${bio.history}</p>
          <p>${bio.blurb}</p>
        `
        : `<p class="bio-meta">No bio on file yet.</p>`}
      ${castStatsHtml(state, castId)}
    </div>
  `;
  modalEl.querySelector('#bio-close-btn').addEventListener('click', () => {
    modalEl.style.display = 'none';
  });
  if (!modalEl.dataset.backdropBound) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) modalEl.style.display = 'none';
    });
    modalEl.dataset.backdropBound = 'true';
  }
}
