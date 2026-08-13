// Milestone-3 bootstrap: credential prompt, initial load, commissioner password gate, and the
// preseason draft setup view, layered on top of the Milestone-1 debug dump (state.js / gist.js /
// draft.js / scoring.js). This file gets replaced by the real hash-based view router later.

import { loadCredentials, saveCredentials, loadCachedState, saveCachedState, loadPlayerIdentity, savePlayerIdentity } from './state.js';
import { fetchState, commitMutation, GistError } from './gist.js';
import { buildInitialState, hashPassword } from './seed.js';
import { computeNextDraftOrder, computeEliminationEpisodes, getUsedSafePicks, isDualSafePickWeek, castGender } from './scoring.js';
import { shuffle, buildDraftBoard, buildStraightBoard, flattenDraftBoard, reorderRemainingSlots, TARGET_ROSTER_SIZE, validatePick } from './draft.js';
import {
  renderPreseasonDraft,
  renderEpisodeEntry,
  renderWeeklyRedraft,
  renderFinalChallengeEntry,
  renderReminders,
  renderSafePicksOverview,
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
  renderSeasonStatus,
} from './views/player.js';

const els = {
  setupForm: document.getElementById('setup-form'),
  tokenInput: document.getElementById('token-input'),
  gistIdInput: document.getElementById('gistid-input'),
  status: document.getElementById('status'),
  seedButton: document.getElementById('seed-button'),
  reloadButton: document.getElementById('reload-button'),
  refreshButton: document.getElementById('refresh-button'),
  commissionerSection: document.getElementById('commissioner-section'),
  unlockForm: document.getElementById('unlock-form'),
  passwordInput: document.getElementById('password-input'),
  commissionerPanel: document.getElementById('commissioner-panel'),
  remindersContainer: document.getElementById('reminders-container'),
  safePicksOverviewContainer: document.getElementById('safe-picks-overview-container'),
  draftContainer: document.getElementById('draft-container'),
  episodeContainer: document.getElementById('episode-container'),
  redraftContainer: document.getElementById('redraft-container'),
  finalChallengeContainer: document.getElementById('final-challenge-container'),
  siteLogo: document.getElementById('site-logo'),
  identityModal: document.getElementById('identity-modal'),
  castBioModal: document.getElementById('cast-bio-modal'),
  countdownContainer: document.getElementById('countdown-container'),
  seasonStatusContainer: document.getElementById('season-status-container'),
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
    renderReminders(els.remindersContainer, state);
    renderSafePicksOverview(els.safePicksOverviewContainer, state);
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
  els.seasonStatusContainer.style.display = preseasonMode ? 'none' : '';
  if (!preseasonMode) renderSeasonStatus(els.seasonStatusContainer, currentState);
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
    onCardClick: (castId) => {
      renderCastBioModal(els.castBioModal, currentState, castId);
      els.castBioModal.style.display = 'flex';
    },
  });
  renderSafePick(els.safePickContainer, currentState, currentManagerId, {
    // Legacy (pre-Week-4) weeks pass a single castId string; Week 4+ passes { boyCastId, girlCastId }
    // since both a boy and a girl pick are now mandatory every week.
    onSubmitSafePick: (payload) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const week = nextEpisodeNumber(fresh);
        const usedCastIds = getUsedSafePicks(fresh, managerId);
        const eliminatedCastIds = new Set(computeEliminationEpisodes(fresh.episodes).keys());
        const weekKey = String(week);
        const weekPicks = (fresh.safePicks[weekKey] ??= []);
        const dual = isDualSafePickWeek(week);

        const upsertPick = (castId) => {
          if (eliminatedCastIds.has(castId)) throw new Error('That cast member has already been eliminated.');
          // Dual weeks have up to two picks per manager (one per gender) — find the slot for this
          // castId's gender specifically. Legacy weeks have exactly one, so managerId alone finds it.
          const existing = weekPicks.find(
            (p) => p.managerId === managerId && (!dual || castGender(fresh, p.castId) === castGender(fresh, castId))
          );
          if (usedCastIds.has(castId) && existing?.castId !== castId) {
            throw new Error("You've already used that cast member for a safe pick this season.");
          }
          if (existing) {
            existing.castId = castId;
            existing.submittedAt = new Date().toISOString();
          } else {
            weekPicks.push({ managerId, castId, submittedAt: new Date().toISOString() });
          }
        };

        if (dual) {
          if (!payload?.boyCastId || !payload?.girlCastId) throw new Error('Both a boy and a girl Safe Pick are required.');
          upsertPick(payload.boyCastId);
          upsertPick(payload.girlCastId);
        } else {
          upsertPick(payload);
        }
        return fresh;
      }),
    // Legacy weeks clear with no argument (the manager's one pick); Week 4+ passes 'M' or 'F' to
    // clear just that gender's pick, since the other one is still required.
    onClearSafePick: (gender) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        const week = nextEpisodeNumber(fresh);
        const weekKey = String(week);
        if (fresh.safePicks[weekKey]) {
          fresh.safePicks[weekKey] = fresh.safePicks[weekKey].filter(
            (p) => !(p.managerId === managerId && (!gender || castGender(fresh, p.castId) === gender))
          );
        }
        return fresh;
      }),
  });
  renderPreseasonBonusPick(els.bonusPickContainer, currentState, currentManagerId, {
    onSubmit: ({ first, second, third }) =>
      runMutation((fresh) => {
        const managerId = loadPlayerIdentity();
        if (isPreseasonBonusPickLocked(fresh)) {
          throw new Error('Winners Circle picks are locked — Episode 1 has already been finalized.');
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
        fresh.finalChallenge = { completed: false, winner: [], second: [], third: [] };
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
    onFixRedraftOrder: () =>
      runMutation((fresh) => {
        const week = getCurrentRedraftWeek(fresh);
        const draft = fresh.drafts.weekly[String(week)];
        const freshOrder = computeNextDraftOrder(fresh);
        if (!freshOrder) throw new Error('Rosters are frozen.');
        draft.board = reorderRemainingSlots(draft.board, draft.picks, freshOrder);
        return fresh;
      }),
    onToggleFreeze: () =>
      runMutation((fresh) => {
        fresh.meta.rosterFrozen = !fresh.meta.rosterFrozen;
        return fresh;
      }),
    onToggleTwistRevealed: () =>
      runMutation((fresh) => {
        fresh.meta.redraftTwistRevealed = !fresh.meta.redraftTwistRevealed;
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
    onSaveEliminations: (castIds) =>
      runMutation((fresh) => {
        getCurrentEpisode(fresh).eliminations = castIds.map((castId) => ({ castId }));
        return fresh;
      }),
    onFinalizeEpisode: () =>
      runMutation((fresh) => {
        const episode = getCurrentEpisode(fresh);
        if (isDualSafePickWeek(episode.episodeNumber) && !episode.safePickDayType) {
          throw new Error('Choose a Safe Pick Day Type (Boy/Girl/Both) before finalizing this episode.');
        }
        episode.finalized = true;
        return fresh;
      }),
    onUnfinalizeEpisode: (episodeNumber) =>
      runMutation((fresh) => {
        const target = fresh.episodes.find((e) => e.episodeNumber === episodeNumber);
        if (!target) throw new Error(`Episode ${episodeNumber} not found.`);
        target.finalized = false;
        return fresh;
      }),
    onSetSafePickDayType: (dayType) =>
      runMutation((fresh) => {
        getCurrentEpisode(fresh).safePickDayType = dayType;
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

// A mutation that failed because the device is genuinely offline (not a rejected pick, not a bad
// response) — kept in memory so it can be replayed automatically once connectivity returns.
// In-memory only: closures can't be persisted to localStorage, so this doesn't survive a killed
// or reloaded app. That covers the realistic case (a wifi/cell blip while the app stays open);
// it does not cover force-quitting mid-submit, which just needs the pick resubmitted by hand.
let queuedRetryMutate = null;

function isConnectivityError(err) {
  // fetch() throws a bare TypeError when it can't reach the network at all (offline, DNS
  // failure, etc.) — a real HTTP response, even an error one, throws GistError instead, and a
  // rejected pick throws a plain Error from inside `mutate`. Only TypeError (or the browser
  // already reporting itself offline) means "retry once we're back online" is the right move.
  return err instanceof TypeError || !navigator.onLine;
}

function flushQueuedRetry() {
  if (!queuedRetryMutate) return;
  const mutate = queuedRetryMutate;
  queuedRetryMutate = null;
  runMutation(mutate);
}

async function runMutation(mutate) {
  const creds = loadCredentials();
  if (!creds) return setStatus('Connect first.', true);
  setStatus('Saving...');
  try {
    // commitMutation already fetches fresh, writes, and re-fetches to confirm the write landed
    // — its return value IS the confirmed state, so rendering it directly (instead of calling
    // loadAndRender, which would fetch that same state a third time) saves a full extra Gist API
    // request on every single successful save.
    const newState = await commitMutation(creds.token, creds.gistId, mutate);
    saveCachedState(newState);
    render(newState);
    setStatus(`Synced ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    if (isConnectivityError(err)) {
      queuedRetryMutate = mutate;
      setStatus("You're offline — this pick will save automatically once you're back online.", true);
    } else {
      setStatus(`Save failed: ${err.message}`, true);
    }
  }
}

const AUTO_REFRESH_MIN_INTERVAL_MS = 20000;
const AUTO_REFRESH_POLL_MS = 60000;
let lastAutoRefreshAt = 0;

function hasFocusedFormControl() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/** Refreshes state from the Gist. `silent` (used for auto-refresh: on resume, on a 60s poll while
 *  foregrounded) skips the refresh entirely rather than risk clobbering in-progress, unsubmitted
 *  form input — every view re-renders via innerHTML, so a mistimed auto-refresh would silently
 *  wipe a half-filled form. Guards: skip while a form control has focus, skip while Commissioner
 *  is unlocked (Jay's own multi-step entry forms are the highest-stakes to clobber, and he already
 *  has the manual Force Reload button), and throttle so resume + poll firing close together don't
 *  double up. The manual Refresh button bypasses all of this — an explicit click always refreshes. */
async function refreshFromGist({ silent = false } = {}) {
  const creds = loadCredentials();
  if (!creds) {
    if (!silent) setStatus('Connect first.', true);
    return;
  }
  if (silent) {
    if (unlocked || hasFocusedFormControl()) return;
    if (Date.now() - lastAutoRefreshAt < AUTO_REFRESH_MIN_INTERVAL_MS) return;
    lastAutoRefreshAt = Date.now();
  }
  try {
    await loadAndRender(creds.token, creds.gistId);
  } catch (err) {
    if (!silent) setStatus(err.message, true);
  }
}

async function loadAndRender(token, gistId) {
  setStatus('Fetching latest state from Gist...');
  const { state } = await fetchState(token, gistId);
  saveCachedState(state);
  render(state);
  setStatus(`Synced ${new Date().toLocaleTimeString()}`);
  flushQueuedRetry();
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

  els.refreshButton.addEventListener('click', () => refreshFromGist());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFromGist({ silent: true });
  });

  setInterval(() => {
    if (document.visibilityState === 'visible') refreshFromGist({ silent: true });
  }, AUTO_REFRESH_POLL_MS);

  window.addEventListener('online', flushQueuedRetry);

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
      renderReminders(els.remindersContainer, currentState);
      renderSafePicksOverview(els.safePicksOverviewContainer, currentState);
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
