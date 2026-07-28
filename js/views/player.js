// Player-facing views (Milestone 4). Pure rendering — no gist.js/state.js knowledge, same
// pattern as commissioner.js. Player actions have no password gate (unlike commissioner mode) —
// the only "identity" is a per-device manager selection, a convenience, not real auth.

import { computeLeaderboard, computeEliminationEpisodes } from '../scoring.js';
import { flattenDraftBoard, getAvailableCast, getRosterForManager, TARGET_ROSTER_SIZE } from '../draft.js';
import { getCurrentRedraftWeek, nextRedraftWeek } from './commissioner.js';
import { managerName, castNameWithGender } from './shared.js';

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
