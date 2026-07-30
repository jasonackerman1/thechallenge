// Local cache. All reads/writes to browser storage go through here.

const STATE_CACHE_KEY = 'challenge-fantasy:state';
const CREDENTIALS_KEY = 'challenge-fantasy:credentials';
const PLAYER_IDENTITY_KEY = 'challenge-fantasy:playerIdentity';
const SCHEMA_VERSION = 1;

export function loadCachedState() {
  const raw = localStorage.getItem(STATE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCachedState(state) {
  localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(state));
}

export function loadCredentials() {
  const raw = localStorage.getItem(CREDENTIALS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCredentials({ token, gistId }) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ token, gistId }));
}

export function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
}

/** Which manager this device belongs to — a per-device convenience, not real auth (same
 *  trusted-family model as the commissioner password: good enough to keep siblings from
 *  accidentally acting as each other, not meant to stop anyone determined to). */
export function loadPlayerIdentity() {
  return localStorage.getItem(PLAYER_IDENTITY_KEY);
}

export function savePlayerIdentity(managerId) {
  localStorage.setItem(PLAYER_IDENTITY_KEY, managerId);
}

export function clearPlayerIdentity() {
  localStorage.removeItem(PLAYER_IDENTITY_KEY);
}

export function migrateSchema(state) {
  // No migrations yet — schemaVersion 1 is the only version this app has ever written.
  if (state.meta.schemaVersion !== SCHEMA_VERSION) {
    console.warn(`Unexpected schemaVersion ${state.meta.schemaVersion}, expected ${SCHEMA_VERSION}`);
  }
  return state;
}

export { SCHEMA_VERSION };
