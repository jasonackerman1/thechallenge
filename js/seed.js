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

// Names + gender confirmed against the real Season 42 (Cutthroat) cast list (Variety/Deadline/
// TVLine coverage, cross-checked individually for the less-common names). "Tori" = Victoria
// Deal, "Izzy" = Isabella Fairthorne, "Lete" = Alexis Lete, "Chris" (Grey) = Chris Underwood —
// kept as the shorter names here since that's how the roster displays in the app either way.
// Exactly 12M/12F, 4-and-4 within each team.
const CAST_BY_TEAM = {
  Blue: [
    ['Cara Maria', 'F'], ['Cedric', 'M'], ['Reilly', 'F'], ['Lete', 'F'],
    ['Anna Leigh', 'F'], ['Nelson', 'M'], ['Josh', 'M'], ['Brad', 'M'],
  ],
  Orange: [
    ['Will', 'M'], ['Deb', 'F'], ['Tori', 'F'], ['Bananas', 'M'],
    ['Justin', 'M'], ['Michele', 'F'], ['Izzy', 'F'], ['CT', 'M'],
  ],
  Grey: [
    ['Cory', 'M'], ['Nurys', 'F'], ['Adrienne', 'F'], ['Cassidy', 'F'],
    ['Chris', 'M'], ['Sydney', 'F'], ['Leo', 'M'], ['Keanu', 'M'],
  ],
};

export function buildInitialState({ commissionerPasswordHash }) {
  const cast = Object.entries(CAST_BY_TEAM).flatMap(([team, entries]) =>
    entries.map(([name, gender]) => ({ id: slug(name), name, team, gender, eliminatedEpisode: null }))
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
    finalChallenge: { completed: false, third: [], second: [], winner: [] },
    drafts: { preseason: null, weekly: {} },
    safePicks: {},
  };
}

export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
