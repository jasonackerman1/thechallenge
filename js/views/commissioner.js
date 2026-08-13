// Commissioner-only views (Milestone 3). Pure rendering — no gist.js/state.js knowledge.
// The caller (app.js) owns data + mutations and passes them in as callbacks.

import { TARGET_ROSTER_SIZE, flattenDraftBoard, getAvailableCast, getRosterForManager, isDraftComplete } from '../draft.js';
import {
  SCORING_EVENT_POINTS,
  FINAL_CHALLENGE_POINTS,
  computeEliminationEpisodes,
  computeEligibleCastIds,
  computeNextDraftOrder,
  computeSeasonEndBonusPoints,
  isDualSafePickWeek,
  castGender,
} from '../scoring.js';
import { managerName, castName } from './shared.js';

/** Shared snake-draft pick UI — used for both the preseason draft and every weekly redraft.
 *  `idPrefix` keeps element ids distinct when both sections render on the same page. */
function renderDraftPicker(container, state, { board, picks, eliminatedCastIds, idPrefix, headerHtml, resetLabel, onPick, onReset, onFixOrder }) {
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

  const fixOrderBtnHtml =
    onFixOrder && !complete
      ? `<button id="${idPrefix}-fix-order-btn">Sync Remaining Draft Order to Current Standings</button>`
      : '';

  container.innerHTML = `
    ${headerHtml}
    <ul>${rosterList}</ul>
    ${pickHtml}
    ${fixOrderBtnHtml}
    <button id="${idPrefix}-reset-btn" style="background:#7a2020;">${resetLabel}</button>
  `;

  if (!complete) {
    container.querySelector(`#${idPrefix}-pick-btn`).addEventListener('click', () => {
      const nextSlot = flat[picks.length];
      const castId = container.querySelector(`#${idPrefix}-pick-select`).value;
      onPick({ managerId: nextSlot.managerId, castId, round: nextSlot.round });
    });
  }

  if (onFixOrder && !complete) {
    container.querySelector(`#${idPrefix}-fix-order-btn`).addEventListener('click', () => {
      if (
        confirm(
          'Reorder the picks nobody has made yet to match current standings? Every pick already made stays exactly as-is — this only fixes who drafts next.'
        )
      ) {
        onFixOrder();
      }
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

export function renderWeeklyRedraft(container, state, { onStartRedraft, onPick, onResetRedraft, onFixRedraftOrder, onToggleFreeze, onToggleTwistRevealed }) {
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
    onFixOrder: onFixRedraftOrder,
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

/** Whether that week's roster-setting process has actually been kicked off by the commissioner:
 *  the preseason draft for Week 1 (Safe Pick is hidden entirely during Preseason Mode until that
 *  draft starts, so this is always true by the time Week 1 can be reached), that week's weekly
 *  redraft for Week 2+, or unconditionally true once rosters are frozen (no more redrafts happen
 *  at all, so nothing to wait on). Matches "unlocks once the redraft opens," not "once it's
 *  complete" — managers can safe-pick while a redraft is still in progress. */
function redraftStartedForWeek(state, week) {
  if (week <= 1) return true;
  if (state.meta.rosterFrozen) return true;
  return !!state.drafts.weekly[String(week)];
}

/** The single source of truth for what Safe Pick should show right now, for both the player
 *  screen and the commissioner's overview. Three phases:
 *  - 'scoring': an episode is actively being entered — last week's picks are locked and shown.
 *  - 'waiting': that episode just finalized, but the commissioner hasn't opened the next week's
 *    redraft yet — Safe Pick stays locked on the *previous* week rather than wide open, since
 *    rosters for the new week aren't even being set yet. This is the Week 4 gap Jay flagged:
 *    `nextEpisodeNumber` alone used to open the next week's picks the instant the prior episode
 *    finalized, with no regard for whether that week's redraft had actually started.
 *  - 'open': pick away. */
export function safePickPhase(state) {
  const currentEpisode = getCurrentEpisode(state);
  if (currentEpisode) return { phase: 'scoring', week: currentEpisode.episodeNumber, episode: currentEpisode };
  const week = nextEpisodeNumber(state);
  if (!redraftStartedForWeek(state, week)) return { phase: 'waiting', week };
  return { phase: 'open', week };
}

/** The week Safe Picks are actually open for right now, or null if none is. Thin wrapper over
 *  `safePickPhase` kept for callers that only care about the open/closed distinction. */
export function currentOpenSafePickWeek(state) {
  const { phase, week } = safePickPhase(state);
  return phase === 'open' ? week : null;
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
    onSetSafePickDayType,
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
    .map(([type, points]) => `<option value="${type}">${type} (${points > 0 ? '+' : ''}${points})</option>`)
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

  // From Week 4 on, every manager submits a boy AND girl Safe Pick — the commissioner decides
  // which gender(s) actually got put at risk this episode, and that's what actually scores.
  // Required before Finalize is allowed so an episode can never lock in with an ambiguous
  // (or forgotten) day type — see safePickGenderIncluded/getUsedSafePicks in scoring.js for how
  // the unscored gender's pick goes back in reserve rather than being lost.
  const dualSafePickWeek = isDualSafePickWeek(episode.episodeNumber);
  const dayTypeBtn = (type, label) => {
    const isActive = episode.safePickDayType === type;
    return `<button data-day-type="${type}" style="${isActive ? 'background:var(--neon-blue, #1081f5); font-weight:700;' : ''}">${isActive ? '✓ ' : ''}${label}</button>`;
  };
  const dayTypeHtml = dualSafePickWeek
    ? `<h4>Safe Pick Day Type</h4>
       <p class="note">Which gender's Safe Picks actually score this episode? The other gender's pick goes back in reserve for a future week — nothing is lost. Must be set before you can finalize.</p>
       <div class="actions">
         ${dayTypeBtn('boy', 'Boy Day')}
         ${dayTypeBtn('girl', 'Girl Day')}
         ${dayTypeBtn('both', 'Both (Double Elimination)')}
       </div>
       ${episode.safePickDayType ? '' : `<p class="note" style="color:var(--neon-red, #e21e15);">Not set yet.</p>`}`
    : '';
  const finalizeDisabled = dualSafePickWeek && !episode.safePickDayType;
  const finalizeBtnHtml = finalizeDisabled
    ? `<button id="finalize-episode-btn" disabled>Finalize Episode ${episode.episodeNumber}</button>
       <p class="note">Choose a Safe Pick Day Type above first.</p>`
    : `<button id="finalize-episode-btn">Finalize Episode ${episode.episodeNumber}</button>`;

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

    ${dayTypeHtml}

    <h4>Finalize</h4>
    ${finalizeBtnHtml}

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

  container.querySelectorAll('[data-day-type]').forEach((btn) => {
    btn.addEventListener('click', () => onSetSafePickDayType(btn.dataset.dayType));
  });

  container.querySelector('#finalize-episode-btn')?.addEventListener('click', () => {
    if (confirm(`Finalize Episode ${episode.episodeNumber}? This locks its scoring into the leaderboard.`)) {
      onFinalizeEpisode();
    }
  });
}

/** The final is a team format — an entire team can tie for a placement, not just one person —
 *  so each of winner/2nd/3rd is a *group* of cast members (usually one, sometimes several).
 *  Everyone in a group scores that placement's roster-ownership points independently; a Winter
 *  Circle prediction is still just one guessed person, credited as a hit if they land anywhere
 *  in that group. */
export function renderFinalChallengeEntry(container, state, { onSetFinalChallenge, onResetFinalChallenge }) {
  const fc = state.finalChallenge ?? { completed: false, winner: [], second: [], third: [] };

  if (fc.completed) {
    const bonusPoints = computeSeasonEndBonusPoints(state);
    const breakdown = state.managers
      .filter((m) => m.active)
      .map((m) => `<li>${m.name}: ${bonusPoints.get(m.id) ?? 0} bonus pt(s)</li>`)
      .join('');
    const namesFor = (castIds) => joinNames((castIds ?? []).map((id) => castName(state, id)));
    container.innerHTML = `
      <p><strong>Winner(s):</strong> ${namesFor(fc.winner)} (+${FINAL_CHALLENGE_POINTS.winner} each, to whoever rostered them)</p>
      <p><strong>2nd:</strong> ${namesFor(fc.second)} (+${FINAL_CHALLENGE_POINTS.second} each)</p>
      <p><strong>3rd:</strong> ${namesFor(fc.third)} (+${FINAL_CHALLENGE_POINTS.third} each)</p>
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
  const checkboxGroup = (groupId, selectedIds) =>
    eligibleCast
      .map(
        (c) => `<label class="checkbox-row">
          <input type="checkbox" data-fc-group="${groupId}" value="${c.id}" ${(selectedIds ?? []).includes(c.id) ? 'checked' : ''} /> ${c.name} (${c.team})
        </label>`
      )
      .join('');

  container.innerHTML = `
    <p>Enter the final challenge's top 3 finishers (from remaining cast). If the whole team ties for
    a placement, check everyone who shares it. Points go to whoever rosters them on their final
    roster, per person: winner +${FINAL_CHALLENGE_POINTS.winner}, 2nd +${FINAL_CHALLENGE_POINTS.second}, 3rd +${FINAL_CHALLENGE_POINTS.third}.</p>
    <div class="control-row">
      <div>
        <h4>Winner(s)</h4>
        <div class="checkbox-grid">${checkboxGroup('winner', fc.winner)}</div>
      </div>
      <div>
        <h4>2nd Place</h4>
        <div class="checkbox-grid">${checkboxGroup('second', fc.second)}</div>
      </div>
      <div>
        <h4>3rd Place</h4>
        <div class="checkbox-grid">${checkboxGroup('third', fc.third)}</div>
      </div>
    </div>
    <button id="save-final-challenge-btn">Save Final Challenge Results</button>
  `;

  const checkedIds = (groupId) =>
    [...container.querySelectorAll(`input[data-fc-group="${groupId}"]:checked`)].map((el) => el.value);

  container.querySelector('#save-final-challenge-btn').addEventListener('click', () => {
    const winner = checkedIds('winner');
    const second = checkedIds('second');
    const third = checkedIds('third');
    if (!winner.length || !second.length || !third.length) {
      alert('Pick at least one cast member for winner, 2nd, and 3rd.');
      return;
    }
    const allIds = [...winner, ...second, ...third];
    if (new Set(allIds).size < allIds.length) {
      alert('A cast member can only occupy one placement — someone is checked in more than one group.');
      return;
    }
    if (confirm('Save final challenge results? This locks in season-end bonus points.')) {
      onSetFinalChallenge({ winner, second, third });
    }
  });
}

function joinNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Everyone's Safe Pick for the week that actually matters right now — the one being scored if
 *  the commissioner is mid-episode, otherwise the currently open week. Lets Jay see every pick at
 *  a glance instead of asking around or hunting through each manager's own screen (the gap that
 *  caused the Week 3 confusion). From Week 4 on, shows each manager's boy AND girl pick, and once
 *  a day type is chosen, marks which one is actually being scored vs. put back in reserve. */
export function renderSafePicksOverview(container, state) {
  const { phase, week: openWeek, episode } = safePickPhase(state);
  // While waiting on the commissioner to open the next redraft, the week that "matters right
  // now" is the one just finalized (still locked, nobody can touch it) — not the not-yet-open
  // next week, which has nothing to show anyway.
  const week = phase === 'waiting' ? openWeek - 1 : openWeek;
  const dual = isDualSafePickWeek(week);
  const dayType = episode?.safePickDayType ?? null;
  const weekPicks = state.safePicks?.[String(week)] ?? [];
  const activeManagers = state.managers.filter((m) => m.active);

  const pickLabel = (pick, gender) => {
    if (!pick) return '<span style="color:var(--text-muted, #9a9590);">&mdash; not submitted &mdash;</span>';
    const name = castName(state, pick.castId);
    if (!dual || !dayType) return name;
    const included = dayType === 'both' || (dayType === 'boy' && gender === 'M') || (dayType === 'girl' && gender === 'F');
    return included ? `${name} &mdash; scoring` : `${name} &mdash; reserved (not this week)`;
  };

  const rows = activeManagers
    .map((m) => {
      const picks = weekPicks.filter((p) => p.managerId === m.id);
      if (!dual) {
        return `<li><strong>${m.name}</strong>: ${pickLabel(picks[0], null)}</li>`;
      }
      const boyPick = picks.find((p) => castGender(state, p.castId) === 'M');
      const girlPick = picks.find((p) => castGender(state, p.castId) === 'F');
      return `<li><strong>${m.name}</strong> &mdash; Boy: ${pickLabel(boyPick, 'M')} &nbsp;|&nbsp; Girl: ${pickLabel(girlPick, 'F')}</li>`;
    })
    .join('');

  const statusNote =
    phase === 'scoring'
      ? `Episode ${week} is being scored &mdash; these picks are locked.`
      : phase === 'waiting'
      ? `Week ${week} is scored and locked. Week ${openWeek} isn't open yet &mdash; waiting for the commissioner to start the Week ${openWeek} redraft.`
      : `Week ${week} is currently open for picking.`;

  container.innerHTML = `
    <p class="note">${statusNote}</p>
    <ul>${rows}</ul>
  `;
}

/** Active managers who haven't submitted a Safe Pick for the currently-open week yet — null week
 *  (nobody's missing) while an episode is being scored, or while the next week's redraft hasn't
 *  been opened yet, matching what a manager actually sees on their own screen either way. From
 *  Week 4 on, both a boy AND a girl pick are required — "missing" means either one is still
 *  unsubmitted. */
function missingSafePicks(state) {
  const week = currentOpenSafePickWeek(state);
  if (week === null) return { week, missing: [] };
  const weekPicks = state.safePicks?.[String(week)] ?? [];
  const dual = isDualSafePickWeek(week);
  const missing = state.managers.filter((m) => {
    if (!m.active) return false;
    const picks = weekPicks.filter((p) => p.managerId === m.id);
    if (!dual) return picks.length === 0;
    const genders = new Set(picks.map((p) => castGender(state, p.castId)));
    return !genders.has('M') || !genders.has('F');
  });
  return { week, missing };
}

/** Whoever is currently holding up a turn-based draft — the preseason draft if it's still
 *  running, otherwise the active weekly redraft, otherwise null if nothing is in progress. */
function currentDraftTurn(state) {
  const preseason = state.drafts.preseason;
  if (preseason) {
    const eliminatedCastIds = new Set(); // preseason draft has no eliminations yet by definition
    const allCastIds = state.cast.map((c) => c.id);
    if (!isDraftComplete(preseason.board, preseason.picks, allCastIds, eliminatedCastIds)) {
      const nextSlot = flattenDraftBoard(preseason.board)[preseason.picks.length];
      return { type: 'preseason', managerId: nextSlot.managerId };
    }
  }
  const week = getCurrentRedraftWeek(state);
  if (week !== null) {
    const draft = state.drafts.weekly[String(week)];
    const nextSlot = flattenDraftBoard(draft.board)[draft.picks.length];
    return { type: 'redraft', week, managerId: nextSlot.managerId };
  }
  return null;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function renderReminders(container, state) {
  const { week: safeWeek, missing } = missingSafePicks(state);
  const turn = currentDraftTurn(state);

  const safeBtnHtml = missing.length
    ? `<button id="remind-safepick-btn">Copy Safe Pick Reminder</button>`
    : `<button disabled>Copy Safe Pick Reminder</button>`;
  const turnBtnHtml = turn
    ? `<button id="remind-turn-btn">Copy Turn Reminder</button>`
    : `<button disabled>Copy Turn Reminder</button>`;

  // Disabled buttons are silent by nature (a tap does nothing, browser-enforced) — a title
  // tooltip doesn't help on a phone with no hover, so the reason has to be plain visible text,
  // not just a dimmed button, or a disabled tap reads as "broken" rather than "nothing to do."
  const safeReasonHtml = missing.length
    ? ''
    : safeWeek === null
      ? `<p class="note">No Safe Pick week is currently open — an episode is being scored.</p>`
      : `<p class="note">✓ Everyone's already submitted Week ${safeWeek}'s Safe Pick.</p>`;
  const turnReasonHtml = turn ? '' : `<p class="note">No draft or redraft is currently active — nobody's turn to nudge.</p>`;

  container.innerHTML = `
    <p class="note">Copies a reminder message to your clipboard — paste it into your Challenge
    Fantasy group chat yourself. Nothing gets sent automatically.</p>
    <div class="actions">
      ${safeBtnHtml}
      ${turnBtnHtml}
    </div>
    ${safeReasonHtml}
    ${turnReasonHtml}
    <p id="reminder-status" class="note"></p>
  `;

  const statusEl = container.querySelector('#reminder-status');

  const safeBtn = container.querySelector('#remind-safepick-btn');
  safeBtn?.addEventListener('click', async () => {
    const names = joinNames(missing.map((m) => m.name));
    const text = `⏰ Reminder: ${names} still need to submit Week ${safeWeek}'s Safe Pick!`;
    const ok = await copyToClipboard(text);
    statusEl.textContent = ok ? `Copied: "${text}"` : `Couldn't copy automatically — here it is to copy by hand: "${text}"`;
  });

  const turnBtn = container.querySelector('#remind-turn-btn');
  turnBtn?.addEventListener('click', async () => {
    const name = managerName(state, turn.managerId);
    const text =
      turn.type === 'preseason'
        ? `⏰ Reminder: ${name}, it's your turn to draft your preseason roster!`
        : `⏰ Reminder: ${name}, it's your turn to redraft your Week ${turn.week} roster!`;
    const ok = await copyToClipboard(text);
    statusEl.textContent = ok ? `Copied: "${text}"` : `Couldn't copy automatically — here it is to copy by hand: "${text}"`;
  });
}
