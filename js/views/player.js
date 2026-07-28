// Player-facing views (Milestone 4). Pure rendering — no gist.js/state.js knowledge, same
// pattern as commissioner.js. Player actions have no password gate (unlike commissioner mode) —
// the only "identity" is a per-device manager selection, a convenience, not real auth.

import {
  computeLeaderboard,
  computeEliminationEpisodes,
  computeSafePickPointsForManagerWeek,
  computeCastSeasonPoints,
  getUsedSafePicks,
  SAFE_PICK_POINTS,
  PRESEASON_BONUS_POINTS,
} from '../scoring.js';
import { flattenDraftBoard, getAvailableCast, getRosterForManager, TARGET_ROSTER_SIZE } from '../draft.js';
import { getCurrentRedraftWeek, nextRedraftWeek, nextEpisodeNumber } from './commissioner.js';
import { managerName, castName, castNameWithGender } from './shared.js';

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

/** Small persistent line showing the current identity, with a link that reopens the modal. */
export function renderIdentityIndicator(container, state, currentManagerId, { onSwitch }) {
  const current = state.managers.find((m) => m.id === currentManagerId);
  container.innerHTML = current
    ? `<p>Playing as <strong>${current.name}</strong>. <button id="switch-identity-btn" class="btn-inline">Switch</button></p>`
    : `<p><button id="switch-identity-btn" class="btn-inline">Who's using this device?</button></p>`;
  container.querySelector('#switch-identity-btn').addEventListener('click', onSwitch);
}

export function renderLeaderboard(container, state, currentManagerId) {
  if (!state.episodes.some((e) => e.finalized)) {
    container.innerHTML = `<p>No episodes finalized yet — the leaderboard fills in once Episode 1 is scored.</p>`;
    return;
  }

  const rows = computeLeaderboard(state)
    .map(
      (row) => `
        <tr${row.managerId === currentManagerId ? ' style="font-weight:700; background:rgba(209,87,31,0.12);"' : ''}>
          <td style="text-align:left;">${row.rank}</td>
          <td style="text-align:left;">${row.name}${row.managerId === currentManagerId ? ' (you)' : ''}</td>
          <td>${row.grandTotal}</td>
          <td>${row.thisWeekRosterPoints}</td>
          <td>${row.thisWeekSafePickPoints}</td>
          <td>${row.bonusPoints}</td>
        </tr>
      `
    )
    .join('');

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">Rank</th>
            <th style="text-align:left;">Manager</th>
            <th>Total</th>
            <th>This Week</th>
            <th>Safe Pick</th>
            <th>Bonus</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
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

function rosterListHtml(state, castIds) {
  return castIds.length ? castIds.map((id) => castNameWithGender(state, id)).join(', ') : '(none yet)';
}

export function renderMyRoster(container, state, currentManagerId, { onPick }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to see your roster.</p>`;
    return;
  }

  if (state.meta.rosterFrozen) {
    container.innerHTML = `
      <p><strong>Rosters are frozen for the rest of the season.</strong></p>
      <p>Your roster: ${rosterListHtml(state, currentRosterIds(state, currentManagerId))}</p>
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
        <p>Your roster so far: ${rosterListHtml(state, myRoster)}</p>
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
        <p>Your roster so far this week: ${rosterListHtml(state, myRoster)}</p>
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
      <p>${rosterListHtml(state, roster)}</p>
    `;
  } else if (!prevEpisode || !prevEpisode.finalized) {
    container.innerHTML = `
      <p>Waiting on Episode ${week - 1} to be finalized before the Week ${week} redraft opens.</p>
      <p>Your current roster: ${rosterListHtml(state, roster)}</p>
    `;
  } else {
    container.innerHTML = `
      <p>Waiting on the commissioner to open the Week ${week} redraft.</p>
      <p>Your current roster: ${rosterListHtml(state, roster)}</p>
    `;
  }
}

function safePickHistoryHtml(state, managerId, uptoWeek) {
  const weeks = Object.keys(state.safePicks ?? {})
    .map(Number)
    .filter((w) => w < uptoWeek)
    .sort((a, b) => a - b);
  const rows = weeks
    .map((w) => {
      const pick = state.safePicks[String(w)].find((p) => p.managerId === managerId);
      if (!pick) return null;
      const points = computeSafePickPointsForManagerWeek(state, managerId, w);
      return `<li>Week ${w}: ${castName(state, pick.castId)} &mdash; ${points} pt(s)</li>`;
    })
    .filter(Boolean);
  return rows.length ? `<ul>${rows.join('')}</ul>` : '<p>(none yet)</p>';
}

export function renderSafePick(container, state, currentManagerId, { onSubmitSafePick, onClearSafePick }) {
  if (!currentManagerId) {
    container.innerHTML = `<p>Pick your identity above to make a safe pick.</p>`;
    return;
  }

  const week = nextEpisodeNumber(state);
  const usedCastIds = getUsedSafePicks(state, currentManagerId);
  const eliminatedCastIds = new Set(computeEliminationEpisodes(state.episodes).keys());
  const existingPick = (state.safePicks?.[String(week)] ?? []).find((p) => p.managerId === currentManagerId);
  // This week's own pick shouldn't count as "already used" against itself, or it'd vanish from
  // its own dropdown and the "selected" pre-fill below would never actually apply to anything.
  const available = state.cast.filter(
    (c) => (!usedCastIds.has(c.id) || c.id === existingPick?.castId) && !eliminatedCastIds.has(c.id)
  );

  const castOptions = available
    .map((c) => `<option value="${c.id}" ${existingPick?.castId === c.id ? 'selected' : ''}>${castNameWithGender(state, c.id)}</option>`)
    .join('');

  container.innerHTML = `
    <p>Pick one cast member you think survives Week ${week}'s episode &mdash; +${SAFE_PICK_POINTS} points if they do.
    Each cast member can only be used once all season, and this locks the moment the commissioner starts entering Week ${week}'s results.</p>
    ${existingPick ? `<p><strong>Current pick:</strong> ${castName(state, existingPick.castId)} <button id="safe-pick-clear-btn" class="btn-inline" style="background:#7a2020;">Clear</button></p>` : ''}
    <div class="control-row">
      <select id="safe-pick-select">${castOptions}</select>
      <button id="safe-pick-submit-btn">${existingPick ? 'Change Pick' : 'Submit Safe Pick'}</button>
    </div>
    <h4>Past Safe Picks</h4>
    ${safePickHistoryHtml(state, currentManagerId, week)}
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
    const resultsKnown = state.finalChallenge?.completed;
    const resultLine = (label, pickId, actualId) => {
      if (!resultsKnown) return `${label}: ${castName(state, pickId)}`;
      const hit = pickId === actualId;
      return `${label}: ${castName(state, pickId)} ${hit ? '&#10003; correct' : ''}`;
    };
    container.innerHTML = `
      <p><strong>Your preseason bonus pick (locked):</strong></p>
      <ul>
        <li>${resultLine('1st', existingPick.first, state.finalChallenge?.winner)}</li>
        <li>${resultLine('2nd', existingPick.second, state.finalChallenge?.second)}</li>
        <li>${resultLine('3rd', existingPick.third, state.finalChallenge?.third)}</li>
      </ul>
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
      const rows = state.cast
        .filter((c) => c.team === team)
        .map((c) => {
          const eliminatedAt = eliminationEpisodes.get(c.id);
          const status = eliminatedAt !== undefined ? `Eliminated (Ep ${eliminatedAt})` : 'Active';
          return `
            <tr${eliminatedAt !== undefined ? ' style="color:var(--text-muted);"' : ''}>
              <td style="text-align:left;">${castNameWithGender(state, c.id)}</td>
              <td style="text-align:left;">${status}</td>
              <td>${seasonPoints.get(c.id) ?? 0}</td>
            </tr>
          `;
        })
        .join('');
      return `
        <h4>${team}</h4>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th style="text-align:left;">Cast</th><th style="text-align:left;">Status</th><th>Season Pts</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    })
    .join('');

  container.innerHTML = sectionsHtml;
}
