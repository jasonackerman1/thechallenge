// One-time seed data: the 6 managers and 24 cast members, used to initialize a brand-new
// Gist on first setup. Not used again after that — all subsequent state lives in the Gist.

function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const CAST_BY_TEAM = {
  Blue: ['Cara Maria', 'Cedric', 'Reilly', 'Lete', 'Anna Leigh', 'Nelson', 'Josh', 'Brad'],
  Orange: ['Will', 'Deb', 'Tori', 'Bananas', 'Justin', 'Michele', 'Izzy', 'CT'],
  Grey: ['Cory', 'Nurys', 'Adrienne', 'Cassidy', 'Chris', 'Sydney', 'Leo', 'Keanu'],
};

export function buildInitialState({ commissionerPasswordHash }) {
  const cast = Object.entries(CAST_BY_TEAM).flatMap(([team, names]) =>
    names.map((name) => ({ id: slug(name), name, team, eliminatedEpisode: null }))
  );

  const managers = [
    { id: 'jay', name: 'Jay', isCommissioner: true, active: true },
    { id: 'lauren', name: 'Lauren', isCommissioner: false, active: true },
    { id: 'owen', name: 'Owen', isCommissioner: false, active: true },
    { id: 'joe', name: 'Joe', isCommissioner: false, active: true },
    { id: 'danielle', name: 'Danielle', isCommissioner: false, active: true },
    { id: 'steve', name: 'Steve', isCommissioner: false, active: true },
  ];

  return {
    meta: {
      schemaVersion: 1,
      commissionerPasswordHash,
      phase: 'PRESEASON',
      currentWeek: 1,
      redraftTwistRevealed: false,
      rosterFrozen: false,
    },
    managers,
    cast,
    preseasonPicks: [],
    episodes: [],
    finalChallenge: { completed: false, third: null, second: null, winner: null },
    drafts: { preseason: null, weekly: {} },
    safePicks: {},
  };
}

export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
