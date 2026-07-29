// Small helpers reused by both commissioner and player views.

export function managerName(state, managerId) {
  return state.managers.find((m) => m.id === managerId)?.name ?? managerId;
}

export function castName(state, castId) {
  return state.cast.find((c) => c.id === castId)?.name ?? castId;
}

export function castNameWithGender(state, castId) {
  const c = state.cast.find((x) => x.id === castId);
  if (!c) return castId;
  return c.gender ? `${c.name} (${c.gender})` : c.name;
}

/** Shared photo-card markup — the official character-card art with a points badge and status
 *  caption, team-color glow (never color alone: the team name is always shown too, either via
 *  a section heading or the status text). Used by Cast Browser, My Roster, Safe Pick, and the
 *  Preseason Bonus Pick cards. `extraClass` layers on state-specific treatments (e.g. Safe
 *  Pick's `sp-success`/`sp-miss`) without needing a new one-off markup shape. */
export function castCardHtml(state, castId, { points, statusText, eliminated = false, extraClass = '' }) {
  const cast = state.cast.find((c) => c.id === castId);
  const teamClass = cast?.team ? `team-${cast.team.toLowerCase()}` : '';
  const stateClass = eliminated ? 'eliminated' : 'active';
  return `
    <div class="cast-card ${stateClass} ${teamClass} ${extraClass}" data-cast-id="${castId}">
      <div class="card-inner">
        <img src="images/cast/${castId}.webp" alt="${cast?.name ?? castId}" loading="lazy" />
        <div class="points-badge">${points}</div>
      </div>
      <div class="status-bar">${statusText}</div>
    </div>
  `;
}
