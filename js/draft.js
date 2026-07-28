// The one reusable draft engine — used for both the one-time preseason draft and every
// weekly redraft (see plan §"Decisions Confirmed": "one system, reused every week, all
// season"). Pure logic, no I/O, so it's testable directly in a console.
//
// Mechanic: every manager always targets TARGET_ROSTER_SIZE. The board is always built for
// that many rounds regardless of how thin the surviving cast pool has gotten — the draft
// just runs pick by pick until either every slot is filled or the pool runs dry, whichever
// comes first (see isDraftComplete). Whoever's picking when the pool runs out that week ends
// up with fewer than the target — that's intentional, not a bug to work around (confirmed
// against a season simulation: the reverse-standings redraft is what's supposed to let a
// shortchanged manager catch up the following week).
//
// The preseason draft uses a snake board (buildDraftBoard) from a one-time random order.
// Every weekly redraft uses a straight board (buildStraightBoard) — same reverse-standings
// order every round, no reversal — chosen deliberately over snake after simulating both: a
// snake board's final round always reverses back to worst-picks-first, which means "picks
// last overall" lands on whoever is CURRENTLY WORST, so a thin pool systematically shortchanges
// the team the mechanic is supposed to be helping. Straight order shortchanges the
// currently-best team instead, which is the equalizing effect that was actually intended.

export const TARGET_ROSTER_SIZE = 4;

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
 * Builds the full draft board: an array of rounds, each an array of managerIds in pick
 * order for that round. Round indices alternate direction (snake) starting from
 * `baseOrder` for round 1. Used for the preseason draft.
 */
export function buildDraftBoard(baseOrder, rounds) {
  const board = [];
  for (let round = 0; round < rounds; round++) {
    board.push(round % 2 === 0 ? [...baseOrder] : [...baseOrder].reverse());
  }
  return board;
}

/**
 * Builds a straight (non-snake) draft board: every round uses the same pick order. Used for
 * every weekly redraft — see the module comment above for why this replaced snake there.
 */
export function buildStraightBoard(baseOrder, rounds) {
  const board = [];
  for (let round = 0; round < rounds; round++) {
    board.push([...baseOrder]);
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

/**
 * A draft is complete once every slot is filled OR the surviving cast pool has run dry —
 * whichever comes first. The pool-ran-dry case is what leaves some managers short of
 * TARGET_ROSTER_SIZE for the week (see module comment).
 */
export function isDraftComplete(board, picks, allCastIds, eliminatedCastIds) {
  const totalSlots = board.reduce((sum, round) => sum + round.length, 0);
  if (picks.length >= totalSlots) return true;
  return getAvailableCast(allCastIds, eliminatedCastIds, picks).length === 0;
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
