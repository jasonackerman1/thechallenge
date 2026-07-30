// Commissioner-only views (Milestone 3). Pure rendering — no gist.js/state.js knowledge.
// The caller (app.js) owns data + mutations and passes them in as callbacks.

import { TARGET_ROSTER_SIZE, flattenDraftBoard, getAvailableCast, getRosterForManager, isDraftComplete } from '../draft.js';
import {
  SCORING_EVENT_POINTS,
  CONFESSIONAL_BONUS_POINTS,
  FINAL_CHALLENGE_POINTS,
  computeEliminationEpisodes,
  computeEligibleCastIds,
  computeNextDraftOrder,
  computeSeasonEndBonusPoints,
} from '../scoring.js';
import { managerName, castName } from './shared.js';

/** Shared snake-draft pick UI — used for both the preseason draft and every weekly redraft.
 *  `idPrefix` keeps element ids distinct when both sections render on the same page. */
function renderDraftPicker(container, state, { board, picks, eliminatedCastIds, idPrefix, headerHtml, resetLabel, onPick, onReset }) {
  const allCastIds = state.cast.map((c) => c.id);
  const flat = flattenDraftBoard(board);
  const complete = isDraftComplete(board, picks, allCastIds, eliminatedCastIds);

  const rosterList = board[0]
    .map((managerId) => {
      const rosterIds = getRosterForManager(picks, managerId);
      const roster = rosterIds.map((castId) => {
        const cast = state.cast.find((c) => c.id === castId);
        return cast?.gender ? `${cast.name} (${cast.gender})` : castName(state, castId);
      });
      const short = complete && roster.length < TARGET_ROSTER_SIZE ? ` <em>(short ${TARGET_ROSTER_SIZE - roster.length} — pool ran out)</em>` : '';
      return `<li><strong>${managerName(state, managerId)}</strong>: ${roster.length ? roster.join(', ') : '(none yet)'}${short}</li>`;
    })
    .join('');

  let pickHtml;
  if (complete) {
    pickHtml = `<p><strong>Draft complete.</strong></p>`;
  } else {
    const nextSlot = flat[picks.length];
    const available = getAvailableCast(allCastIds, eliminatedCastIds, picks);
    const castOptions = available
      .map((id) => {
        const cast = state.cast.find((c) => c.id === id);
        return `<option value="${id}">${cast.name} (${cast.team}${cast.gender ? ', ' + cast.gender : ''})</option>`;
      })
      .join('');

    // Soft gender-balance hint (attempt boy/girl/boy/girl — never blocks a pick, so this is
    // just informational). Degrades to nothing if this state predates the `gender` field.
    let genderHintHtml = '';
    if (state.cast[0]?.gender) {
      const managerRoster = getRosterForManager(picks, nextSlot.managerId).map((id) => state.cast.find((c) => c.id === id)?.gender);
      const mCount = managerRoster.filter((g) => g === 'M').length;
      const fCount = managerRoster.filter((g) => g === 'F').length;
      const suggestion = mCount <= fCount ? 'a guy' : 'a girl';
      genderHintHtml = `<p style="font-size:0.85rem; color:var(--text-muted, #9a9590);">${managerName(state, nextSlot.managerId)} so far: ${mCount} guy(s), ${fCount} girl(s) &mdash; aiming for ${suggestion} next (not required)</p>`;
    }

    pickHtml = `
      <h4>Round ${nextSlot.round + 1} of ${board.length} &mdash; ${managerName(state, nextSlot.managerId)}'s pick</h4>
      ${genderHintHtml}
      <div class="control-row">
        <select id="${idPrefix}-pick-select">${castOptions}</select>
        <button id="${idPrefix}-pick-btn">Submit Pick</button>
      </div>
    `;
  }

  container.innerHTML = `
    ${headerHtml}
    <ul>${rosterList}</ul>
    ${pickHtml}
    <button id="${idPrefix}-reset-btn" style="background:#7a2020;">${resetLabel}</button>
  `;

  if (!complete) {
    container.querySelector(`#${idPrefix}-pick-btn`).addEventListener('click', () => {
      const nextSlot = flat[picks.length];
      const castId = container.querySelector(`#${idPrefix}-pick-select`).value;
      onPick({ managerId: nextSlot.managerId, castId, round: nextSlot.round });
    });
  }

  container.querySelector(`#${idPrefix}-reset-btn`).addEventListener('click', onReset);
}

export function renderPreseasonDraft(container, state, { onStartDraft, onPick, onResetDraft }) {
  const draft = state.drafts.preseason;
  const activeManagers = state.managers.filter((m) => m.active);

  if (!draft) {
    container.innerHTML = `
      <p>${activeManagers.length} active managers, ${state.cast.length} cast members
      &rarr; targeting ${TARGET_ROSTER_SIZE} per manager, random round-1 order, snake thereafter.</p>
      <button id="start-draft-btn">Start Preseason Draft</button>
    `;
    container.querySelector('#start-draft-btn').addEventListener('click', onStartDraft);
    return;
  }

  const round1Order = draft.board[0].map((managerId) => managerName(state, managerId)).join(' &rarr; ');

  renderDraftPicker(container, state, {
    board: draft.board,
    picks: draft.picks,
    eliminatedCastIds: new Set(),
    idPrefix: 'preseason',
    headerHtml: `<p><strong>Round 1 draft order (randomized):</strong> ${round1Order}</p>`,
    resetLabel: 'Reset Preseason Draft',
    onPick,
    onReset: () => {
      if (confirm('Reset the entire preseason draft? This clears every pick made so far.')) onResetDraft();
    },
  });
}

/** The week currently being drafted: the most recent entry in drafts.weekly, if it isn't
 *  complete yet. Mirrors getCurrentEpisode's "last item, unless it's done" pattern. */
export function getCurrentRedraftWeek(state) {
  const weeks = Object.keys(state.drafts.weekly)
    .map(Number)
    .sort((a, b) => a - b);
  const last = weeks[weeks.length - 1];
  if (last === undefined) return null;
  const draft = state.drafts.weekly[String(last)];
  const eliminatedCastIds = new Set(computeEliminationEpisodes(state.episodes).keys());
  return isDraftComplete(draft.board, draft.picks, state.cast.map((c) => c.id), eliminatedCastIds) ? null : last;
}

export function nextRedraftWeek(state) {
  const weeks = Object.keys(state.drafts.weekly)
    .map(Number)
    .sort((a, b) => a - b);
  const last = weeks[weeks.length - 1];
  return last ? last + 1 : 2;
}

/** Past weekly redrafts, most recent first, with a flag on any manager who ended up short of
 *  TARGET_ROSTER_SIZE because the cast pool ran dry that week — surfaced here since a
 *  completed week drops out of the active picker view the moment it's done. */
function redraftHistoryHtml(state) {
  const weeks = Object.keys(state.drafts.weekly)
    .map(Number)
    .sort((a, b) => b - a);
  if (!weeks.length) return '';
  return `<h4>Past Redrafts</h4><ul>${weeks
    .map((week) => {
      const draft = state.drafts.weekly[String(week)];
      const rosters = draft.board[0].map((managerId) => {
        const size = getRosterForManager(draft.picks, managerId).length;
        const name = managerName(state, managerId);
        return size < TARGET_ROSTER_SIZE ? `${name} (${size})` : name;
      });
      return `<li>Week ${week}: ${rosters.join(', ')}</li>`;
    })
    .join('')}</ul>`;
}

/** Warns once the surviving cast pool is thinner than the active manager count — meaning some
 *  manager is about to get zero players this week, not just fewer than the target of 4. */
function scarcityBannerHtml(state) {
  if (state.meta.rosterFrozen) return '';
  const eligibleCount = computeEligibleCastIds(state).length;
  const activeCount = state.managers.filter((m) => m.active).length;
  if (eligibleCount >= activeCount) return '';
  return `<p style="color:var(--neon-red, #e21e15); font-weight:600;">&#9888; Only ${eligibleCount} cast remain for ${activeCount} active managers &mdash; someone will get zero players this week. Consider freezing rosters.</p>`;
}

function freezeControlHtml(state) {
  return state.meta.rosterFrozen
    ? `<p><strong>Rosters are frozen.</strong> <button id="freeze-toggle-btn" class="btn-inline">Unfreeze Rosters</button></p>`
    : `<button id="freeze-toggle-btn" class="btn-inline" style="background:#7a2020;">Freeze Rosters</button>`;
}

function attachFreezeListener(container, state, onToggleFreeze) {
  container.querySelector('#freeze-toggle-btn')?.addEventListener('click', () => {
    const willFreeze = !state.meta.rosterFrozen;
    if (willFreeze && !confirm('Freeze rosters for the rest of the season? No more weekly redrafts will happen after this — every manager keeps their current roster through the finale.')) {
      return;
    }
    onToggleFreeze();
  });
}

/** The season's one twist (kept secret from the family until Jay reveals it): everyone starts
 *  from a one-time preseason draft, and right after Episode 1 airs, every week from then on gets
 *  a brand-new redraft. Until this flag flips, My Roster shows a neutral "Your Roster" with no
 *  hint that a redraft is coming — see the reveal-gate in views/player.js. */
function twistControlHtml(state) {
  return state.meta.redraftTwistRevealed
    ? `<p><strong>Redraft twist revealed to the family.</strong> <button id="twist-toggle-btn" class="btn-inline">Undo (hide again)</button></p>`
    : `<button id="twist-toggle-btn" class="btn-inline" style="background:#7a2020;">Reveal Redraft Twist to Family</button>`;
}

function attachTwistListener(container, state, onToggleTwistRevealed) {
  container.querySelector('#twist-toggle-btn')?.addEventListener('click', () => {
    const willReveal = !state.meta.redraftTwistRevealed;
    if (
      willReveal &&
      !confirm(
        'Reveal the redraft twist to the family? Once revealed, My Roster will show the real weekly redraft (turns, picks, etc.) to everyone instead of just their current roster.'
      )
    ) {
      return;
    }
    onToggleTwistRevealed();
  });
}

export function renderWeeklyRedraft(container, state, { onStartRedraft, onPick, onResetRedraft, onToggleFreeze, onToggleTwistRevealed }) {
  const currentWeek = getCurrentRedraftWeek(state);
  const statusHtml = `${scarcityBannerHtml(state)}${twistControlHtml(state)}${freezeControlHtml(state)}`;

  if (currentWeek === null) {
    const week = nextRedraftWeek(state);

    if (state.meta.rosterFrozen) {
      container.innerHTML = `${statusHtml}<p><strong>No further redrafts this season.</strong></p>${redraftHistoryHtml(state)}`;
      attachFreezeListener(container, state, onToggleFreeze);
  attachTwistListener(container, state, onToggleTwistRevealed);
      return;
    }

    const prevEpisode = state.episodes.find((e) => e.episodeNumber === week - 1);
    if (!prevEpisode || !prevEpisode.finalized) {
      container.innerHTML = `${statusHtml}<p>Waiting on Episode ${week - 1} to be finalized before the Week ${week} redraft can start.</p>${redraftHistoryHtml(state)}`;
      attachFreezeListener(container, state, onToggleFreeze);
  attachTwistListener(container, state, onToggleTwistRevealed);
      return;
    }

    const baseOrder = computeNextDraftOrder(state);
    const eligibleCastIds = computeEligibleCastIds(state);
    const activeManagers = state.managers.filter((m) => m.active);
    const orderPreview = baseOrder.map((id) => managerName(state, id)).join(' &rarr; ');

    container.innerHTML = `
      ${statusHtml}
      <p><strong>Week ${week} draft order (reverse standings, same order every round):</strong> ${orderPreview}</p>
      <p>${eligibleCastIds.length} cast remaining, ${activeManagers.length} active managers
      &rarr; targeting ${TARGET_ROSTER_SIZE} per manager (whoever's picking when the pool runs out gets fewer).</p>
      <button id="start-redraft-btn">Start Week ${week} Redraft</button>
      ${redraftHistoryHtml(state)}
    `;
    container.querySelector('#start-redraft-btn').addEventListener('click', onStartRedraft);
    attachFreezeListener(container, state, onToggleFreeze);
  attachTwistListener(container, state, onToggleTwistRevealed);
    return;
  }

  const draft = state.drafts.weekly[String(currentWeek)];
  const eliminatedCastIds = new Set(computeEliminationEpisodes(state.episodes).keys());
  const round1Order = draft.board[0].map((managerId) => managerName(state, managerId)).join(' &rarr; ');

  renderDraftPicker(container, state, {
    board: draft.board,
    picks: draft.picks,
    eliminatedCastIds,
    idPrefix: 'redraft',
    headerHtml: `${statusHtml}<h4>Week ${currentWeek} Redraft</h4><p><strong>Draft order (reverse standings, same order every round):</strong> ${round1Order}</p>`,
    resetLabel: `Reset Week ${currentWeek} Redraft`,
    onPick,
    onReset: () => {
      if (confirm(`Reset the Week ${currentWeek} redraft? This clears every pick made so far.`)) onResetRedraft();
    },
  });
  attachFreezeListener(container, state, onToggleFreeze);
  attachTwistListener(container, state, onToggleTwistRevealed);
}

/** The episode currently being entered: whichever one isn't finalized yet. Normally that's
 *  the last episode (freshly started), but reopening an older, already-corrected episode for
 *  corrections (see onUnfinalizeEpisode) also surfaces it here — there's only ever at most one
 *  unfinalized episode at a time, by construction (reopening is only offered when none is open). */
export function getCurrentEpisode(state) {
  return state.episodes.find((e) => !e.finalized) ?? null;
}

export function nextEpisodeNumber(state) {
  const last = state.episodes[state.episodes.length - 1];
  return last ? last.episodeNumber + 1 : 1;
}

/** Episode N can't start until that week's roster is actually set: the preseason draft for
 *  Episode 1, or that week's redraft for Episode 2+ — unless rosters are frozen, in which case
 *  there's no more redrafting for the rest of the season and episodes just keep going. */
export function rostersReadyForEpisode(state, episodeNumber) {
  const allCastIds = state.cast.map((c) => c.id);
  if (episodeNumber === 1) {
    const draft = state.drafts.preseason;
    return !!draft && isDraftComplete(draft.board, draft.picks, allCastIds, new Set());
  }
  if (state.meta.rosterFrozen) return true;
  const draft = state.drafts.weekly[String(episodeNumber)];
  const eliminatedCastIds = new Set(computeEliminationEpisodes(state.episodes).keys());
  return !!draft && isDraftComplete(draft.board, draft.picks, allCastIds, eliminatedCastIds);
}

function finalizedEpisodesHtml(state) {
  const finalized = state.episodes.filter((e) => e.finalized);
  if (!finalized.length) return '<p style="color:var(--text-muted, #9a9590);">(no finalized episodes yet)</p>';
  return `<ul>${finalized
    .map((e) => {
      const eliminated = e.eliminations.length ? e.eliminations.map((el) => castName(state, el.castId)).join(', ') : 'none';
      return `<li>Episode ${e.episodeNumber}: eliminated ${eliminated} &mdash; ${e.scoringEvents.length} scoring event(s)</li>`;
    })
    .join('')}</ul>`;
}

export function renderEpisodeEntry(
  container,
  state,
  {
    onStartEpisode,
    onAddScoringEvent,
    onRemoveScoringEvent,
    onSaveEliminations,
    onFinalizeEpisode,
    onUnfinalizeEpisode,
  }
) {
  const episode = getCurrentEpisode(state);

  if (!episode) {
    const n = nextEpisodeNumber(state);
    const finalized = state.episodes.filter((e) => e.finalized);
    const ready = rostersReadyForEpisode(state, n);
    const startButtonHtml = ready
      ? `<button id="start-episode-btn">Start Episode ${n}</button>`
      : `<p style="color:var(--neon-blue, #1081f5);">Episode ${n} can't start yet &mdash; ${
          n === 1 ? 'finish the preseason draft' : `finish the Week ${n} redraft`
        } first.</p>`;
    const reopenOptionsHtml = finalized
      .map((e) => `<option value="${e.episodeNumber}">Episode ${e.episodeNumber}</option>`)
      .join('');
    container.innerHTML = `
      <p>Ready to start Episode ${n}.</p>
      ${startButtonHtml}
      ${
        finalized.length
          ? `<div class="control-row">
              <select id="reopen-episode-select">${reopenOptionsHtml}</select>
              <button id="unfinalize-btn" style="background:#7a2020;">Reopen for Corrections</button>
            </div>`
          : ''
      }
      <h4>Finalized Episodes</h4>
      ${finalizedEpisodesHtml(state)}
    `;
    if (ready) {
      container.querySelector('#start-episode-btn').addEventListener('click', () => onStartEpisode(n));
    }
    if (finalized.length) {
      container.querySelector('#unfinalize-btn').addEventListener('click', () => {
        const episodeNumber = Number(container.querySelector('#reopen-episode-select').value);
        const isMostRecent = episodeNumber === finalized[finalized.length - 1].episodeNumber;
        const warning = isMostRecent
          ? ''
          : ` This episode has newer finalized episodes after it — any weekly redraft order computed since then already happened and won't be recomputed, even if this correction changes the standings.`;
        if (
          confirm(
            `Reopen Episode ${episodeNumber}? It will drop off the leaderboard until you finalize it again, and no new episode can start until then.${warning}`
          )
        ) {
          onUnfinalizeEpisode(episodeNumber);
        }
      });
    }
    return;
  }

  // Cast still eligible for events/eliminations THIS episode: not eliminated in a strictly
  // earlier episode. (Someone eliminated in this very episode can still have earned points
  // earlier in it, so they aren't excluded here — only from *future* episodes.)
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const eligibleCast = state.cast.filter((c) => {
    const eliminatedAt = eliminationEpisodes.get(c.id);
    return eliminatedAt === undefined || eliminatedAt >= episode.episodeNumber;
  });

  const eventTypeOptions = Object.entries(SCORING_EVENT_POINTS)
    .map(([type, points]) => {
      const label = type === 'CONFESSIONAL' ? `CONFESSIONAL (+${CONFESSIONAL_BONUS_POINTS} bonus to whoever has the most this episode)` : `${type} (${points > 0 ? '+' : ''}${points})`;
      return `<option value="${type}">${label}</option>`;
    })
    .join('');

  const castOptions = eligibleCast.map((c) => `<option value="${c.id}">${c.name} (${c.team})</option>`).join('');

  const eventsList = episode.scoringEvents.length
    ? episode.scoringEvents
        .map(
          (ev) => `<li>${castName(state, ev.castId)} &mdash; ${ev.type} (${SCORING_EVENT_POINTS[ev.type]} pts) x${ev.count}
        <button class="btn-inline" data-remove-event="${ev.id}" style="background:#7a2020;">Remove</button></li>`
        )
        .join('')
    : '<li>(none yet)</li>';

  const eliminatedThisEpisodeIds = new Set(episode.eliminations.map((e) => e.castId));
  const eliminationCheckboxes = eligibleCast
    .map(
      (c) => `<label class="checkbox-row">
        <input type="checkbox" value="${c.id}" ${eliminatedThisEpisodeIds.has(c.id) ? 'checked' : ''} /> ${c.name} (${c.team})
      </label>`
    )
    .join('');
  const savedEliminationsText = episode.eliminations.length
    ? episode.eliminations.map((e) => castName(state, e.castId)).join(', ')
    : '(none saved yet)';

  const isReopened = state.episodes.some((e) => e.finalized && e.episodeNumber > episode.episodeNumber);
  container.innerHTML = `
    <h3>Episode ${episode.episodeNumber} ${isReopened ? '(reopened for corrections)' : '(in progress)'}</h3>
    ${isReopened ? `<p style="color:var(--neon-red, #e21e15);">This episode has already-finalized episodes after it. Don't forget to finalize it again when you're done.</p>` : ''}

    <h4>Scoring Events</h4>
    <ul>${eventsList}</ul>
    <div class="control-row">
      <select id="event-cast-select">${castOptions}</select>
      <select id="event-type-select">${eventTypeOptions}</select>
      <input id="event-count-input" type="number" min="1" value="1" placeholder="count" />
      <button id="add-event-btn">Add Event</button>
    </div>

    <h4>Eliminations This Episode</h4>
    <div id="episode-entry-eliminations" class="checkbox-grid">${eliminationCheckboxes}</div>
    <button id="save-eliminations-btn">Save Eliminations</button>
    <p><strong>Saved:</strong> ${savedEliminationsText}</p>

    <h4>Finalize</h4>
    <button id="finalize-episode-btn">Finalize Episode ${episode.episodeNumber}</button>

    <h4>Finalized Episodes</h4>
    ${finalizedEpisodesHtml(state)}
  `;

  container.querySelector('#add-event-btn').addEventListener('click', () => {
    const castId = container.querySelector('#event-cast-select').value;
    const type = container.querySelector('#event-type-select').value;
    const count = Number(container.querySelector('#event-count-input').value) || 1;
    onAddScoringEvent({ castId, type, count });
  });

  container.querySelectorAll('[data-remove-event]').forEach((btn) => {
    btn.addEventListener('click', () => onRemoveScoringEvent(btn.dataset.removeEvent));
  });

  container.querySelector('#save-eliminations-btn').addEventListener('click', () => {
    const castIds = [...container.querySelectorAll('#episode-entry-eliminations input:checked')].map((el) => el.value);
    onSaveEliminations(castIds);
  });

  container.querySelector('#finalize-episode-btn').addEventListener('click', () => {
    if (confirm(`Finalize Episode ${episode.episodeNumber}? This locks its scoring into the leaderboard.`)) {
      onFinalizeEpisode();
    }
  });
}

export function renderFinalChallengeEntry(container, state, { onSetFinalChallenge, onResetFinalChallenge }) {
  const fc = state.finalChallenge ?? { completed: false, winner: null, second: null, third: null };

  if (fc.completed) {
    const bonusPoints = computeSeasonEndBonusPoints(state);
    const breakdown = state.managers
      .filter((m) => m.active)
      .map((m) => `<li>${m.name}: ${bonusPoints.get(m.id) ?? 0} bonus pt(s)</li>`)
      .join('');
    container.innerHTML = `
      <p><strong>Winner:</strong> ${castName(state, fc.winner)} (+${FINAL_CHALLENGE_POINTS.winner} to whoever rostered them)</p>
      <p><strong>2nd:</strong> ${castName(state, fc.second)} (+${FINAL_CHALLENGE_POINTS.second})</p>
      <p><strong>3rd:</strong> ${castName(state, fc.third)} (+${FINAL_CHALLENGE_POINTS.third})</p>
      <h4>Season-End Bonus Points (final challenge + preseason predictions)</h4>
      <ul>${breakdown}</ul>
      <button id="reset-final-challenge-btn" style="background:#7a2020;">Reset Final Challenge Results</button>
    `;
    container.querySelector('#reset-final-challenge-btn').addEventListener('click', () => {
      if (confirm('Reset the final challenge results? This removes final-challenge bonus points from the leaderboard until re-entered.')) {
        onResetFinalChallenge();
      }
    });
    return;
  }

  const eligibleCast = state.cast.filter((c) => !computeEliminationEpisodes(state.episodes).has(c.id));
  const castOptions = eligibleCast.map((c) => `<option value="${c.id}">${c.name} (${c.team})</option>`).join('');

  container.innerHTML = `
    <p>Enter the final challenge's top 3 finishers (from remaining cast). Points go to whoever
    rosters them on their final roster: winner +${FINAL_CHALLENGE_POINTS.winner}, 2nd +${FINAL_CHALLENGE_POINTS.second}, 3rd +${FINAL_CHALLENGE_POINTS.third}.</p>
    <div class="control-row">
      <select id="fc-winner-select">${castOptions}</select>
      <select id="fc-second-select">${castOptions}</select>
      <select id="fc-third-select">${castOptions}</select>
    </div>
    <button id="save-final-challenge-btn">Save Final Challenge Results</button>
  `;

  container.querySelector('#save-final-challenge-btn').addEventListener('click', () => {
    const winner = container.querySelector('#fc-winner-select').value;
    const second = container.querySelector('#fc-second-select').value;
    const third = container.querySelector('#fc-third-select').value;
    if (new Set([winner, second, third]).size < 3) {
      alert('Winner, 2nd, and 3rd must be three different cast members.');
      return;
    }
    if (confirm('Save final challenge results? This locks in season-end bonus points.')) {
      onSetFinalChallenge({ winner, second, third });
    }
  });
}
