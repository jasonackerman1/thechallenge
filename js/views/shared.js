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
