// Milestone-1 bootstrap: first-run credential prompt, initial load, and a bare debug view
// so the data layer (state.js / gist.js / draft.js / scoring.js) can be verified end-to-end
// before any real commissioner/player UI exists. This file gets replaced by the router +
// view modules in later milestones.

import { loadCredentials, saveCredentials, loadCachedState, saveCachedState } from './state.js';
import { fetchState, commitMutation, GistError } from './gist.js';
import { buildInitialState, hashPassword } from './seed.js';
import { computeLeaderboard } from './scoring.js';

const els = {
  setupForm: document.getElementById('setup-form'),
  tokenInput: document.getElementById('token-input'),
  gistIdInput: document.getElementById('gistid-input'),
  status: document.getElementById('status'),
  seedButton: document.getElementById('seed-button'),
  reloadButton: document.getElementById('reload-button'),
  stateDump: document.getElementById('state-dump'),
  leaderboardDump: document.getElementById('leaderboard-dump'),
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#c0392b' : '#2d6a4f';
}

function render(state) {
  els.stateDump.textContent = JSON.stringify(state, null, 2);
  els.leaderboardDump.textContent = JSON.stringify(computeLeaderboard(state), null, 2);
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
}

boot();
