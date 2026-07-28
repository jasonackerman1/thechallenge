// Commissioner-only views (Milestone 3). Pure rendering — no gist.js/state.js knowledge.
// The caller (app.js) owns data + mutations and passes them in as callbacks.

import { computeRosterSize, flattenDraftBoard, getAvailableCast, getRosterForManager, isDraftComplete } from '../draft.js';
import { SCORING_EVENT_POINTS, computeEliminationEpisodes } from '../scoring.js';

function managerName(state, managerId) {
  return state.managers.find((m) => m.id === managerId)?.name ?? managerId;
}

function castName(state, castId) {
  return state.cast.find((c) => c.id === castId)?.name ?? castId;
}

export function renderPreseasonDraft(container, state, { onStartDraft, onPick, onResetDraft }) {
  const draft = state.drafts.preseason;
  const activeManagers = state.managers.filter((m) => m.active);

  if (!draft) {
    const rounds = computeRosterSize(state.cast.length, activeManagers.length);
    container.innerHTML = `
      <p>${activeManagers.length} active managers, ${state.cast.length} cast members
      &rarr; ${rounds} round(s) per manager, random round-1 order, snake thereafter.</p>
      <button id="start-draft-btn">Start Preseason Draft</button>
    `;
    container.querySelector('#start-draft-btn').addEventListener('click', onStartDraft);
    return;
  }

  const { board, picks } = draft;
  const flat = flattenDraftBoard(board);
  const complete = isDraftComplete(board, picks);

  const round1Order = board[0].map((managerId) => managerName(state, managerId)).join(' &rarr; ');

  const rosterList = board[0]
    .map((managerId) => {
      const m = state.managers.find((mgr) => mgr.id === managerId);
      const roster = getRosterForManager(picks, managerId).map((castId) => state.cast.find((c) => c.id === castId)?.name ?? castId);
      return `<li><strong>${m.name}</strong>: ${roster.length ? roster.join(', ') : '(none yet)'}</li>`;
    })
    .join('');

  let pickHtml;
  if (complete) {
    pickHtml = `<p><strong>Draft complete.</strong> All rosters are set for Episode 1.</p>`;
  } else {
    const nextSlot = flat[picks.length];
    const available = getAvailableCast(state.cast.map((c) => c.id), new Set(), picks);
    const castOptions = available
      .map((id) => {
        const cast = state.cast.find((c) => c.id === id);
        return `<option value="${id}">${cast.name} (${cast.team})</option>`;
      })
      .join('');
    pickHtml = `
      <h3>Round ${nextSlot.round + 1} of ${board.length} &mdash; ${managerName(state, nextSlot.managerId)}'s pick</h3>
      <select id="pick-select">${castOptions}</select>
      <button id="pick-btn">Submit Pick</button>
    `;
  }

  container.innerHTML = `
    <p><strong>Round 1 draft order (randomized):</strong> ${round1Order}</p>
    <ul>${rosterList}</ul>
    ${pickHtml}
    <button id="reset-draft-btn" style="background:#7a2020;">Reset Preseason Draft</button>
  `;

  if (!complete) {
    container.querySelector('#pick-btn').addEventListener('click', () => {
      const nextSlot = flat[picks.length];
      const castId = container.querySelector('#pick-select').value;
      onPick({ managerId: nextSlot.managerId, castId, round: nextSlot.round });
    });
  }

  container.querySelector('#reset-draft-btn').addEventListener('click', () => {
    if (confirm('Reset the entire preseason draft? This clears every pick made so far.')) onResetDraft();
  });
}

/** The episode currently being entered: the last one in the array, if it isn't finalized yet. */
export function getCurrentEpisode(state) {
  const last = state.episodes[state.episodes.length - 1];
  return last && !last.finalized ? last : null;
}

export function nextEpisodeNumber(state) {
  const last = state.episodes[state.episodes.length - 1];
  return last ? last.episodeNumber + 1 : 1;
}

function finalizedEpisodesHtml(state) {
  const finalized = state.episodes.filter((e) => e.finalized);
  if (!finalized.length) return '<p style="color:var(--text-muted, #9a9590);">(no finalized episodes yet)</p>';
  return `<ul>${finalized
    .map((e) => {
      const eliminated = e.eliminations.length ? e.eliminations.map((el) => castName(state, el.castId)).join(', ') : 'none';
      return `<li>Episode ${e.episodeNumber}: eliminated ${eliminated} &mdash; ${e.scoringEvents.length} scoring event(s), ${e.confessionalMinutes.length} confessional entr${e.confessionalMinutes.length === 1 ? 'y' : 'ies'}</li>`;
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
    onSetConfessional,
    onSaveEliminations,
    onFinalizeEpisode,
    onUnfinalizeLastEpisode,
  }
) {
  const episode = getCurrentEpisode(state);

  if (!episode) {
    const n = nextEpisodeNumber(state);
    const last = state.episodes[state.episodes.length - 1];
    container.innerHTML = `
      <p>Ready to start Episode ${n}.</p>
      <button id="start-episode-btn">Start Episode ${n}</button>
      ${last ? `<button id="unfinalize-btn" style="background:#7a2020;">Reopen Episode ${last.episodeNumber} for Corrections</button>` : ''}
      <h4>Finalized Episodes</h4>
      ${finalizedEpisodesHtml(state)}
    `;
    container.querySelector('#start-episode-btn').addEventListener('click', () => onStartEpisode(n));
    if (last) {
      container.querySelector('#unfinalize-btn').addEventListener('click', () => {
        if (
          confirm(
            `Reopen Episode ${last.episodeNumber}? It will drop off the leaderboard until you finalize it again, and Episode ${n} won't be startable until then.`
          )
        ) {
          onUnfinalizeLastEpisode();
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

  const confessionalList = episode.confessionalMinutes.length
    ? episode.confessionalMinutes.map((c) => `<li>${castName(state, c.castId)}: ${c.minutes} min</li>`).join('')
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

  container.innerHTML = `
    <h3>Episode ${episode.episodeNumber} (in progress)</h3>

    <h4>Scoring Events</h4>
    <ul>${eventsList}</ul>
    <select id="event-cast-select">${castOptions}</select>
    <select id="event-type-select">${eventTypeOptions}</select>
    <input id="event-count-input" type="number" min="1" value="1" placeholder="count" />
    <button id="add-event-btn">Add Event</button>

    <h4>Confessional Minutes</h4>
    <ul>${confessionalList}</ul>
    <select id="confessional-cast-select">${castOptions}</select>
    <input id="confessional-minutes-input" type="number" min="0" step="0.5" placeholder="minutes" />
    <button id="set-confessional-btn">Set Minutes</button>

    <h4>Eliminations This Episode</h4>
    <div id="episode-entry-eliminations">${eliminationCheckboxes}</div>
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

  container.querySelector('#set-confessional-btn').addEventListener('click', () => {
    const castId = container.querySelector('#confessional-cast-select').value;
    const minutes = Number(container.querySelector('#confessional-minutes-input').value);
    if (!Number.isFinite(minutes)) return;
    onSetConfessional({ castId, minutes });
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
