// Player-facing views (Milestone 4). Pure rendering — no gist.js/state.js knowledge, same
// pattern as commissioner.js. Player actions have no password gate (unlike commissioner mode) —
// the only "identity" is a per-device manager selection, a convenience, not real auth.

import {
  computeLeaderboard,
  computeEliminationEpisodes,
  computeCastSeasonPoints,
  SAFE_PICK_POINTS,
  PRESEASON_BONUS_POINTS,
} from '../scoring.js';
import { flattenDraftBoard, getAvailableCast, getRosterForManager, TARGET_ROSTER_SIZE } from '../draft.js';
import { getCurrentRedraftWeek, nextRedraftWeek, nextEpisodeNumber } from './commissioner.js';
import { managerName, castName, castNameWithGender, castCardHtml } from './shared.js';

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

  const rowsHtml = standings
    .map((row) => {
      const isYou = row.managerId === currentManagerId;
      const barPct = Math.max(4, Math.round((row.grandTotal / maxTotal) * 100));
      return `
        <div class="lb-row ${isYou ? 'you' : ''} ${row.rank === 1 ? 'rank-1' : ''}">
          <div class="lb-rank">${row.rank}</div>
          <div class="lb-info">
            <div class="lb-name">${row.name}${isYou ? '<span class="you-tag">YOU</span>' : ''}</div>
            <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${barPct}%"></div></div>
            <div class="lb-breakdown">This week +${row.thisWeekRosterPoints} &middot; Safe pick +${row.thisWeekSafePickPoints} &middot; Bonus +${row.bonusPoints}</div>
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

export function renderMyRoster(container, state, currentManagerId, { onPick }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to see your roster.</p>`;
    return;
  }

  if (state.meta.rosterFrozen) {
    container.innerHTML = `
      <p><strong>Rosters are frozen for the rest of the season.</strong></p>
      ${rosterCardsHtml(state, currentRosterIds(state, currentManagerId))}
    `;
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

      let genderHintHtml = '';
      if (state.cast[0]?.gender) {
        const genders = myRoster.map((id) => state.cast.find((c) => c.id === id)?.gender);
        const mCount = genders.filter((g) => g === 'M').length;
        const fCount = genders.filter((g) => g === 'F').length;
        const suggestion = mCount <= fCount ? 'a guy' : 'a girl';
        genderHintHtml = `<p style="font-size:0.85rem; color:var(--text-muted);">You have ${mCount} guy(s), ${fCount} girl(s) so far &mdash; aiming for ${suggestion} next (not required)</p>`;
      }

      container.innerHTML = `
        <p><strong>It's your turn!</strong> Week ${currentWeek} redraft, round ${nextSlot.round + 1} of ${draft.board.length}.</p>
        <h4>Your Roster So Far</h4>
        ${rosterCardsHtml(state, myRoster)}
        ${genderHintHtml}
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
      // Available to pick (or this week's own not-yet-decided pick).
      const extraClass = ['sp-pickable', isCurrentPick ? 'sp-chosen' : ''].filter(Boolean).join(' ');
      const statusText = isCurrentPick ? `Week ${week} Pick` : castNameWithGender(state, c.id);
      return castCardHtml(state, c.id, { points: seasonPoints.get(c.id) ?? 0, statusText, extraClass });
    })
    .join('');

  container.innerHTML = `
    <p>Tap one cast member you think survives Week ${week}'s episode &mdash; +${SAFE_PICK_POINTS} points if they do.
    Each cast member can only be used once all season, and this locks the moment the commissioner starts entering Week ${week}'s results.</p>
    ${existingPick ? `<p><strong>Current pick:</strong> ${castName(state, existingPick.castId)} <button id="safe-pick-clear-btn" class="btn-inline" style="background:#7a2020;">Clear</button></p>` : ''}
    <div class="cast-grid compact">${cardsHtml}</div>
  `;

  container.querySelectorAll('.cast-card.sp-pickable').forEach((card) => {
    card.addEventListener('click', () => onSubmitSafePick(card.dataset.castId));
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
    container.innerHTML = `<p>Pick your identity above to make your preseason bonus pick.</p>`;
    return;
  }

  const existingPick = (state.preseasonPicks ?? []).find((p) => p.managerId === currentManagerId);
  const locked = isPreseasonBonusPickLocked(state);

  if (locked) {
    if (!existingPick) {
      container.innerHTML = `<p>Preseason bonus picks are locked (Episode 1 is finalized). You didn't submit one.</p>`;
      return;
    }
    container.innerHTML = `
      <p><strong>Your preseason bonus pick (locked):</strong></p>
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
      <select id="bonus-first-select">${castOptions(existingPick?.first)}</select>
      <select id="bonus-second-select">${castOptions(existingPick?.second)}</select>
      <select id="bonus-third-select">${castOptions(existingPick?.third)}</select>
    </div>
    <button id="bonus-submit-btn">${existingPick ? 'Change Pick' : 'Submit Bonus Pick'}</button>
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

export function renderCastBrowser(container, state) {
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

  container.innerHTML = sectionsHtml;
}
