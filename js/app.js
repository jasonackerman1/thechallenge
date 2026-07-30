// Milestone-3 bootstrap: credential prompt, initial load, commissioner password gate, and the
// preseason draft setup view, layered on top of the Milestone-1 debug dump (state.js / gist.js /
// draft.js / scoring.js). This file gets replaced by the real hash-based view router later.

import { loadCredentials, saveCredentials, loadCachedState, saveCachedState, loadPlayerIdentity, savePlayerIdentity } from './state.js';
import { fetchState, commitMutation, GistError } from './gist.js';
import { buildInitialState, hashPassword } from './seed.js';
import { computeNextDraftOrder, computeEliminationEpisodes, getUsedSafePicks } from './scoring.js';
import { shuffle, buildDraftBoard, buildStraightBoard, flattenDraftBoard, TARGET_ROSTER_SIZE, validatePick } from './draft.js';
import {
  renderPreseasonDraft,
  renderEpisodeEntry,
  renderWeeklyRedraft,
  renderFinalChallengeEntry,
  getCurrentEpisode,
  nextEpisodeNumber,
  rostersReadyForEpisode,
  getCurrentRedraftWeek,
  nextRedraftWeek,
} from './views/commissioner.js';
import {
  renderIdentityModal,
  renderIdentityIndicator,
  renderLeaderboard,
  renderMyRoster,
  renderSafePick,
  renderPreseasonBonusPick,
  isPreseasonBonusPickLocked,
  renderCastBrowser,
  renderCountdown,
  renderCastBioModal,
} from './views/player.js';

const els = {
  setupForm: document.getElementById('setup-form'),
  tokenInput: document.getElementById('token-input'),
  gistIdInput: document.getElementById('gistid-input'),
  status: document.getElementById('status'),
  seedButton: document.getElementById('seed-button'),
  reloadButton: document.getElementById('reload-button'),
  commissionerSection: document.getElementById('commissioner-section'),
  unlockForm: document.getElementById('unlock-form'),
  passwordInput: document.getElementById('password-input'),
  commissionerPanel: document.getElementById('commissioner-panel'),
  draftContainer: document.getElementById('draft-container'),
  episodeContainer: document.getElementById('episode-container'),
  redraftContainer: document.getElementById('redraft-container'),
  finalChallengeContainer: document.getElementById('final-challenge-container'),
  siteLogo: document.getElementById('site-logo'),
  identityModal: document.getElementById('identity-modal'),
  castBioModal: document.getElementById('cast-bio-modal'),
  countdownContainer: document.getElementById('countdown-container'),
  leaderboardSection: document.getElementById('leaderboard-section'),
  leaderboardContainer: document.getElementById('leaderboard-container'),
  myRosterSection: document.getElementById('my-roster-section'),
  myRosterContainer: document.getElementById('my-roster-container'),
  safePickSection: document.getElementById('safe-pick-section'),
  safePickContainer: document.getElementById('safe-pick-container'),
  bonusPickContainer: document.getElementById('bonus-pick-container'),
  castBrowserSection: document.getElementById('cast-browser-section'),
  castBrowserContainer: document.getElementById('cast-browser-container'),
};

let currentState = null;
let unlocked = false;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#c0392b' : '#2d6a4f';
}

function render(state) {
  currentState = state;
  if (!state?.managers) {
    // Nothing seeded yet — renderPlayerView (which normally gates this section by identity)
    // never runs without managers to pick an identity from, so show Commissioner here as the
    // bootstrap path: whoever holds the token/Gist ID needs to reach Seed Initial Data to
    // create the season in the first place. Once real managers exist, renderPlayerView's
    // identity-based gating below takes over on every subsequent render.
    els.commissionerSection.style.display = '';
  }
  if (state?.managers) {
    renderPlayerView();
  }
  if (unlocked && state?.managers) {
    renderDraft();
    renderEpisode();
    renderRedraft();
    renderFinalChallenge();
  }
}

function openIdentityModal() {
  renderIdentityModal(els.identityModal, currentState, {
    onSetIdentity: (managerId) => {
      savePlayerIdentity(managerId);
      els.identityModal.style.display = 'none';
      renderPlayerView();
    },
  });
  els.identityModal.style.display = 'flex';
}

/** Preseason Mode: before the commissioner has ever run the preseason draft, there's nothing
 *  real yet for Leaderboard/My Roster/Safe Pick to show — so hide them and lead with Cast
 *  Browser (open by default here, unlike its normal closed-by-default accordion state) plus a
 *  countdown to draft night. Preseason Bonus Pick stays too since it's a real, usable action
 *  before the draft happens (it's a season-finish prediction, not roster-dependent). Commissioner
 *  mode is untouched by this — Jay still needs it to actually run the draft. */
function isPreseasonMode(state) {
  return !state.drafts.preseason;
}

function renderPlayerView() {
  const currentManagerId = loadPlayerIdentity();
  const preseasonMode = isPreseasonMode(currentState);

  renderIdentityIndicator(els.siteLogo, { onSwitch: openIdentityModal });

  // Commissioner mode is Jay-only — hidden from every other identity's view entirely, not just
  // practically gated behind the password (which stays as a second layer regardless).
  els.commissionerSection.style.display = currentManagerId === 'jay' ? '' : 'none';

  els.countdownContainer.style.display = preseasonMode ? 'block' : 'none';
  els.leaderboardSection.style.display = preseasonMode ? 'none' : '';
  els.myRosterSection.style.display = preseasonMode ? 'none' : '';
  els.safePickSection.style.display = preseasonMode ? 'none' : '';
  if (preseasonMode) {
    renderCountdown(els.countdownContainer);
    els.castBrowserSection.open = true;
  }

  renderLeaderboard(els.leaderboardContainer, currentState, currentManagerId);
  renderMyRoster(els.myRosterContainer, currentState, currentManagerId, {
    onPick: (castId) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const week = getCurrentRedraftWeek(fresh);
        if (week === null) throw new Error('No redraft is currently open.');
        const draft = fresh.drafts.weekly[String(week)];
        const flat = flattenDraftBoard(draft.board);
        const nextSlot = flat[draft.picks.length];
        if (nextSlot.managerId !== managerId) {
          throw new Error("It's not your turn anymore — someone else just picked. Refresh and try again.");
        }
        const eliminatedCastIds = new Set(computeEliminationEpisodes(fresh.episodes).keys());
        validatePick({ board: draft.board, picks: draft.picks, eliminatedCastIds, managerId, castId });
        draft.picks.push({ managerId, castId, round: nextSlot.round });
        return fresh;
      }),
    onPreseasonPick: (castId) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const draft = fresh.drafts.preseason;
        if (!draft) throw new Error('The preseason draft has not started yet.');
        const flat = flattenDraftBoard(draft.board);
        const nextSlot = flat[draft.picks.length];
        if (nextSlot.managerId !== managerId) {
          throw new Error("It's not your turn anymore — someone else just picked. Refresh and try again.");
        }
        validatePick({ board: draft.board, picks: draft.picks, eliminatedCastIds: new Set(), managerId, castId });
        draft.picks.push({ managerId, castId, round: nextSlot.round });
        return fresh;
      }),
  });
  renderSafePick(els.safePickContainer, currentState, currentManagerId, {
    onSubmitSafePick: (castId) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const week = nextEpisodeNumber(fresh);
        const usedCastIds = getUsedSafePicks(fresh, managerId);
        const eliminatedCastIds = new Set(computeEliminationEpisodes(fresh.episodes).keys());
        if (eliminatedCastIds.has(castId)) throw new Error('That cast member has already been eliminated.');
        const weekKey = String(week);
        const weekPicks = (fresh.safePicks[weekKey] ??= []);
        const existing = weekPicks.find((p) => p.managerId === managerId);
        if (usedCastIds.has(castId) && existing?.castId !== castId) {
          throw new Error("You've already used that cast member for a safe pick this season.");
        }
        if (existing) {
          existing.castId = castId;
          existing.submittedAt = new Date().toISOString();
        } else {
          weekPicks.push({ managerId, castId, submittedAt: new Date().toISOString() });
        }
        return fresh;
      }),
    onClearSafePick: () =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const week = nextEpisodeNumber(fresh);
        const weekKey = String(week);
        if (fresh.safePicks[weekKey]) {
          fresh.safePicks[weekKey] = fresh.safePicks[weekKey].filter((p) => p.managerId !== managerId);
        }
        return fresh;
      }),
  });
  renderPreseasonBonusPick(els.bonusPickContainer, currentState, currentManagerId, {
    onSubmit: ({ first, second, third }) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        if (isPreseasonBonusPickLocked(fresh)) {
          throw new Error('Winter Circle picks are locked — Episode 1 has already been finalized.');
        }
        const existing = fresh.preseasonPicks.find((p) => p.managerId === managerId);
        if (existing) {
          existing.first = first;
          existing.second = second;
          existing.third = third;
          existing.submittedAt = new Date().toISOString();
        } else {
          fresh.preseasonPicks.push({ managerId, first, second, third, submittedAt: new Date().toISOString() });
        }
        return fresh;
      }),
  });
  renderCastBrowser(els.castBrowserContainer, currentState, {
    onCardClick: (castId) => {
      renderCastBioModal(els.castBioModal, currentState, castId);
      els.castBioModal.style.display = 'flex';
    },
  });
  if (!currentManagerId) openIdentityModal();
}

function renderFinalChallenge() {
  renderFinalChallengeEntry(els.finalChallengeContainer, currentState, {
    onSetFinalChallenge: ({ winner, second, third }) =>
      runMutation((fresh) => {
        fresh.finalChallenge = { completed: true, winner, second, third };
        return fresh;
      }),
    onResetFinalChallenge: () =>
      runMutation((fresh) => {
        fresh.finalChallenge = { completed: false, winner: null, second: null, third: null };
        return fresh;
      }),
  });
}

function renderRedraft() {
  renderWeeklyRedraft(els.redraftContainer, currentState, {
    onStartRedraft: () =>
      runMutation((fresh) => {
        const week = nextRedraftWeek(fresh);
        const baseOrder = computeNextDraftOrder(fresh);
        if (!baseOrder) throw new Error('Rosters are frozen.');
        const board = buildStraightBoard(baseOrder, TARGET_ROSTER_SIZE);
        fresh.drafts.weekly[String(week)] = { board, picks: [] };
        return fresh;
      }),
    onPick: ({ managerId, castId, round }) =>
      runMutation((fresh) => {
        const week = getCurrentRedraftWeek(fresh);
        const draft = fresh.drafts.weekly[String(week)];
        const eliminatedCastIds = new Set(computeEliminationEpisodes(fresh.episodes).keys());
        validatePick({ board: draft.board, picks: draft.picks, eliminatedCastIds, managerId, castId });
        draft.picks.push({ managerId, castId, round });
        return fresh;
      }),
    onResetRedraft: () =>
      runMutation((fresh) => {
        const week = getCurrentRedraftWeek(fresh);
        if (week) delete fresh.drafts.weekly[String(week)];
        return fresh;
      }),
    onToggleFreeze: () =>
      runMutation((fresh) => {
        fresh.meta.rosterFrozen = !fresh.meta.rosterFrozen;
        return fresh;
      }),
  });
}

function renderEpisode() {
  renderEpisodeEntry(els.episodeContainer, currentState, {
    onStartEpisode: (episodeNumber) =>
      runMutation((fresh) => {
        const n = nextEpisodeNumber(fresh);
        if (episodeNumber !== n || !rostersReadyForEpisode(fresh, n)) {
          throw new Error(`Episode ${n} isn't ready to start yet — rosters aren't set.`);
        }
        fresh.episodes.push({
          episodeNumber,
          finalized: false,
          scoringEvents: [],
          confessionalMinutes: [],
          eliminations: [],
        });
        return fresh;
      }),
    onAddScoringEvent: ({ castId, type, count }) =>
      runMutation((fresh) => {
        getCurrentEpisode(fresh).scoringEvents.push({ id: crypto.randomUUID(), castId, type, count });
        return fresh;
      }),
    onRemoveScoringEvent: (eventId) =>
      runMutation((fresh) => {
        const episode = getCurrentEpisode(fresh);
        episode.scoringEvents = episode.scoringEvents.filter((ev) => ev.id !== eventId);
        return fresh;
      }),
    onSetConfessional: ({ castId, minutes }) =>
      runMutation((fresh) => {
        const episode = getCurrentEpisode(fresh);
        const existing = episode.confessionalMinutes.find((c) => c.castId === castId);
        if (existing) existing.minutes = minutes;
        else episode.confessionalMinutes.push({ castId, minutes });
        return fresh;
      }),
    onSaveEliminations: (castIds) =>
      runMutation((fresh) => {
        getCurrentEpisode(fresh).eliminations = castIds.map((castId) => ({ castId }));
        return fresh;
      }),
    onFinalizeEpisode: () =>
      runMutation((fresh) => {
        getCurrentEpisode(fresh).finalized = true;
        return fresh;
      }),
    onUnfinalizeLastEpisode: () =>
      runMutation((fresh) => {
        fresh.episodes[fresh.episodes.length - 1].finalized = false;
        return fresh;
      }),
  });
}

function renderDraft() {
  renderPreseasonDraft(els.draftContainer, currentState, {
    onStartDraft: () =>
      runMutation((fresh) => {
        const activeManagers = fresh.managers.filter((m) => m.active);
        const board = buildDraftBoard(shuffle(activeManagers.map((m) => m.id)), TARGET_ROSTER_SIZE);
        fresh.drafts.preseason = { board, picks: [] };
        return fresh;
      }),
    onPick: ({ managerId, castId, round }) =>
      runMutation((fresh) => {
        const picks = fresh.drafts.preseason.picks;
        validatePick({ board: fresh.drafts.preseason.board, picks, eliminatedCastIds: new Set(), managerId, castId });
        picks.push({ managerId, castId, round });
        return fresh;
      }),
    onResetDraft: () =>
      runMutation((fresh) => {
        fresh.drafts.preseason = null;
        return fresh;
      }),
  });
}

async function runMutation(mutate) {
  const creds = loadCredentials();
  if (!creds) return setStatus('Connect first.', true);
  setStatus('Saving...');
  try {
    await commitMutation(creds.token, creds.gistId, mutate);
    await loadAndRender(creds.token, creds.gistId);
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, true);
  }
}

async function loadAndRender(token, gistId) {
  setStatus('Fetching latest state from Gist...');
  const { state } = await fetchState(token, gistId);
  saveCachedState(state);
  render(state);
  setStatus(`Synced ${new Date().toLocaleTimeString()}`);
  return state;
}

async function handleSeed(token, gistId) {
  const password = prompt('Set the commissioner password (Jay only):');
  if (!password) return;
  const commissionerPasswordHash = await hashPassword(password);
  setStatus('Seeding initial data...');
  await commitMutation(token, gistId, () => buildInitialState({ commissionerPasswordHash }));
  await loadAndRender(token, gistId);
}

function boot() {
  const creds = loadCredentials();
  const cached = loadCachedState();
  if (cached) render(cached);

  if (creds) {
    els.setupForm.style.display = 'none';
    loadAndRender(creds.token, creds.gistId).catch((err) => {
      setStatus(`Offline or fetch failed — showing cached data. (${err.message})`, true);
    });
  } else {
    setStatus('Enter your Gist token + Gist ID to connect.');
  }

  els.setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = els.tokenInput.value.trim();
    const gistId = els.gistIdInput.value.trim();
    if (!token || !gistId) return;
    saveCredentials({ token, gistId });
    els.setupForm.style.display = 'none';
    try {
      await loadAndRender(token, gistId);
    } catch (err) {
      setStatus(`Could not connect: ${err instanceof GistError ? err.message : err}`, true);
      els.setupForm.style.display = '';
    }
  });

  els.seedButton.addEventListener('click', async () => {
    const creds = loadCredentials();
    if (!creds) return setStatus('Connect first.', true);
    try {
      await handleSeed(creds.token, creds.gistId);
    } catch (err) {
      setStatus(`Seed failed: ${err.message}`, true);
    }
  });

  els.reloadButton.addEventListener('click', () => {
    const creds = loadCredentials();
    if (!creds) return setStatus('Connect first.', true);
    loadAndRender(creds.token, creds.gistId).catch((err) => setStatus(err.message, true));
  });

  els.unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = els.passwordInput.value;
    els.passwordInput.value = '';
    if (!currentState?.meta?.commissionerPasswordHash) {
      return setStatus('Seed initial data first.', true);
    }
    const hash = await hashPassword(password);
    if (hash === currentState.meta.commissionerPasswordHash) {
      unlocked = true;
      els.unlockForm.style.display = 'none';
      els.commissionerPanel.style.display = '';
      renderDraft();
      renderEpisode();
      renderRedraft();
      renderFinalChallenge();
    } else {
      setStatus('Wrong commissioner password.', true);
    }
  });
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
