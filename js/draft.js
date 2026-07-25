// The one reusable draft engine — used for both the one-time preseason draft and every
// weekly redraft (see plan §"Decisions Confirmed": "one system, reused every week, all
// season"). Pure logic, no I/O, so it's testable directly in a console.
//
// Mechanic: a snake draft. Round 1 goes in a "base order" (random for the preseason
// draft, reverse-standings for every weekly redraft); round 2 reverses that order, round
// 3 restores it, and so on. The draft runs until every manager has an equal-sized roster —
// roster size is derived from the shrinking cast pool, not fixed (see computeRosterSize).

/** Fisher-Yates shuffle. Only ever used for the preseason draft's one-time random order. */
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Roster size for a draft: as many full rounds as the eligible cast pool can support
 * split evenly across drafting managers, floored at a minimum of 1 (see plan's
 * "Endgame Scarcity Handling" — this is what keeps a draft meaningful even once the
 * cast pool gets thin from eliminations).
 */
export function computeRosterSize(eligibleCastCount, managerCount) {
  if (managerCount <= 0) return 0;
  return Math.max(1, Math.floor(eligibleCastCount / managerCount));
}

/**
 * Builds the full draft board: an array of rounds, each an array of managerIds in pick
 * order for that round. Round indices alternate direction (snake) starting from
 * `baseOrder` for round 1.
 */
export function buildDraftBoard(baseOrder, rounds) {
  const board = [];
  for (let round = 0; round < rounds; round++) {
    board.push(round % 2 === 0 ? [...baseOrder] : [...baseOrder].reverse());
  }
  return board;
}

/** Flattens a draft board into the real global pick sequence: [{ round, managerId }, ...]. */
export function flattenDraftBoard(board) {
  return board.flatMap((managerIds, round) => managerIds.map((managerId) => ({ round, managerId })));
}

/** All castIds a given manager has picked so far in this draft. */
export function getRosterForManager(picks, managerId) {
  return picks.filter((p) => p.managerId === managerId).map((p) => p.castId);
}

/** All castIds claimed by anyone so far in this draft (exclusivity pool). */
export function getClaimedCastIds(picks) {
  return new Set(picks.map((p) => p.castId));
}

/** Cast still available to draft: not eliminated, not already claimed this draft. */
export function getAvailableCast(allCastIds, eliminatedCastIds, picks) {
  const claimed = getClaimedCastIds(picks);
  return allCastIds.filter((id) => !eliminatedCastIds.has(id) && !claimed.has(id));
}

/**
 * Which pick slot (round + managerId) is next, in global draft order, for a manager who
 * hasn't yet made all their picks. Picks are submitted asynchronously (not strictly
 * turn-blocked — see plan §3), so this is informational/UI-only, not an enforcement gate.
 */
export function nextSlotForManager(board, picks, managerId) {
  const flat = flattenDraftBoard(board);
  const madeByRound = new Set(
    picks.filter((p) => p.managerId === managerId).map((p) => p.round)
  );
  return flat.find((slot) => slot.managerId === managerId && !madeByRound.has(slot.round)) ?? null;
}

export function isDraftComplete(board, picks) {
  const totalSlots = board.reduce((sum, round) => sum + round.length, 0);
  return picks.length >= totalSlots;
}

/**
 * Validates a pick attempt against freshly-fetched draft state (per plan §3, this must be
 * called with state just fetched from the Gist, not a stale in-memory copy, so the
 * exclusivity check is race-free). Throws a descriptive Error if invalid.
 */
export function validatePick({ board, picks, eliminatedCastIds, managerId, castId }) {
  const flat = flattenDraftBoard(board);
  const totalRounds = board.length;

  if (eliminatedCastIds.has(castId)) {
    throw new Error(`${castId} has already been eliminated`);
  }
  if (getClaimedCastIds(picks).has(castId)) {
    throw new Error(`${castId} was just claimed by another manager this draft`);
  }
  const managerRoundsPicked = new Set(
    picks.filter((p) => p.managerId === managerId).map((p) => p.round)
  );
  if (managerRoundsPicked.size >= totalRounds) {
    throw new Error(`${managerId} has already completed their roster for this draft`);
  }
  const isValidSlot = flat.some((slot) => slot.managerId === managerId);
  if (!isValidSlot) {
    throw new Error(`${managerId} is not part of this draft`);
  }
  return true;
}
