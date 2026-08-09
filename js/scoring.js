// Pure computation engine (plan §2). Takes the whole `state` object and derives every
// point total fresh — nothing here is ever read from a stored "total" field, so there is
// no way for a cached number to drift from the raw events it should represent.
//
// Convention: week number === episode number (one episode airs per week, per the season
// format described in the plan). `drafts.preseason` supplies Week 1's rosters;
// `drafts.weekly[week]` supplies Week 2 onward.

import { flattenDraftBoard } from './draft.js';

export const SCORING_EVENT_POINTS = {
  // +5 per occurrence, same as every other counted event — no longer a per-episode "most
  // confessionals" bonus.
  CONFESSIONAL: 5,
  WON_DAILY: 5,
  WON_ELIMINATION: 10,
  DQ_QUIT: -5,
  DQ_QUIT_INJURY: -15,
  CRIED: -5,
  MADE_OUT: 10,
  PUKED: -10,
};

/** Human-readable labels for the stats breakdown modal (My Roster) — SCORING_EVENT_POINTS' keys
 *  are the wire/storage format, these are display-only. */
export const SCORING_EVENT_LABELS = {
  CONFESSIONAL: 'Confessional',
  WON_DAILY: 'Won Daily Challenge',
  WON_ELIMINATION: 'Won Elimination Challenge',
  DQ_QUIT: 'DQ / Quit',
  DQ_QUIT_INJURY: 'DQ / Quit (Injury)',
  CRIED: 'Cried',
  MADE_OUT: 'Made Out',
  PUKED: 'Puked',
};

export const SURVIVED_WEEK_POINTS = 5;
export const SAFE_PICK_POINTS = 10;
export const FINAL_CHALLENGE_POINTS = { third: 10, second: 25, winner: 50 };
export const PRESEASON_BONUS_POINTS = { first: 30, second: 20, third: 10 };

/** Map<castId, episodeNumber> — the episode each cast member was eliminated in. */
export function computeEliminationEpisodes(episodes) {
  const map = new Map();
  for (const episode of episodes) {
    for (const { castId } of episode.eliminations ?? []) {
      if (!map.has(castId)) map.set(castId, episode.episodeNumber);
    }
  }
  return map;
}

export function isEliminatedAsOf(castId, episodeNumber, eliminationEpisodes) {
  const eliminatedAt = eliminationEpisodes.get(castId);
  return eliminatedAt !== undefined && eliminatedAt <= episodeNumber;
}

/** Map<managerId, castId[]> — that manager's roster for the given week. */
export function getRosterForWeek(state, week) {
  const source = week === 1 ? state.drafts.preseason : state.drafts.weekly?.[String(week)];
  const rosters = new Map();
  if (!source) return rosters;
  for (const pick of source.picks) {
    if (!rosters.has(pick.managerId)) rosters.set(pick.managerId, []);
    rosters.get(pick.managerId).push(pick.castId);
  }
  return rosters;
}

function allRosteredCastIdsForWeek(state, week) {
  const rosters = getRosterForWeek(state, week);
  return new Set([...rosters.values()].flat());
}

/** Total points a single cast member earned in a single episode, including the derived
 *  Survived-the-Week bonus. `rosteredThisWeek` = was this cast member on any roster that week. */
export function computeCastPointsForEpisode(episode, castId, rosteredThisWeek, eliminationEpisodes) {
  let points = 0;
  for (const event of episode.scoringEvents ?? []) {
    if (event.castId !== castId) continue;
    points += (SCORING_EVENT_POINTS[event.type] ?? 0) * (event.count ?? 1);
  }
  const eliminatedThisEpisode = isEliminatedAsOf(castId, episode.episodeNumber, eliminationEpisodes);
  if (rosteredThisWeek && !eliminatedThisEpisode) {
    points += SURVIVED_WEEK_POINTS;
  }
  return points;
}

/** Roster points a manager earned for a given week (their roster's cast performance that episode). */
export function computeRosterPointsForManagerWeek(state, managerId, week) {
  const episode = state.episodes.find((e) => e.episodeNumber === week);
  if (!episode) return 0;
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const roster = getRosterForWeek(state, week).get(managerId) ?? [];
  return roster.reduce(
    (sum, castId) => sum + computeCastPointsForEpisode(episode, castId, true, eliminationEpisodes),
    0
  );
}

/** Safe-pick points a manager earned for a given week: +10 if their pick survived, else 0. */
export function computeSafePickPointsForManagerWeek(state, managerId, week) {
  const weekPicks = state.safePicks?.[String(week)] ?? [];
  const pick = weekPicks.find((p) => p.managerId === managerId);
  if (!pick) return 0;
  const episode = state.episodes.find((e) => e.episodeNumber === week);
  if (!episode) return 0;
  const eliminatedThisEpisode = (episode.eliminations ?? []).some((e) => e.castId === pick.castId);
  return eliminatedThisEpisode ? 0 : SAFE_PICK_POINTS;
}

/** Every cast member a manager has already used as a safe pick, across all weeks so far. */
export function getUsedSafePicks(state, managerId) {
  const used = new Set();
  for (const weekPicks of Object.values(state.safePicks ?? {})) {
    const pick = weekPicks.find((p) => p.managerId === managerId);
    if (pick) used.add(pick.castId);
  }
  return used;
}

const finalizedWeeks = (state) =>
  state.episodes.filter((e) => e.finalized).map((e) => e.episodeNumber);

/** Cumulative total per manager: sum of all finalized weeks' roster + safe-pick points.
 *  Preseason bonus and final-challenge points are added separately, only at season end. */
export function computeCumulativeTotals(state) {
  const totals = new Map();
  for (const manager of state.managers) {
    let total = 0;
    for (const week of finalizedWeeks(state)) {
      total += computeRosterPointsForManagerWeek(state, manager.id, week);
      total += computeSafePickPointsForManagerWeek(state, manager.id, week);
    }
    totals.set(manager.id, total);
  }
  return totals;
}

function tiebreakRosterPointsOnly(state, managerId) {
  return finalizedWeeks(state).reduce(
    (sum, week) => sum + computeRosterPointsForManagerWeek(state, managerId, week),
    0
  );
}

function draftSourceForWeek(state, week) {
  return week === 1 ? state.drafts.preseason : state.drafts.weekly?.[String(week)];
}

/** Tiebreak signal: this manager's single latest (worst) pick slot in the draft that set the
 *  rosters currently earning points (preseason for week 1, otherwise that week's redraft).
 *  Draft slots are fixed by the board itself, not by which picks were actually made. Deliberately
 *  NOT an average — a snake board with an even number of rounds is symmetric by design, so every
 *  manager's average position ties exactly and never breaks anything. Each global slot index
 *  belongs to exactly one manager, so no two managers can ever share the same max slot — this
 *  can never itself produce a tie (short of a manager somehow having zero picks in that draft).
 *  Higher (later/worse pick) wins, on the theory that less draft selection to work with and still
 *  matching the score deserves the tiebreak nod. */
function tiebreakDraftDisadvantage(state, managerId) {
  const weeks = finalizedWeeks(state);
  if (!weeks.length) return 0;
  const source = draftSourceForWeek(state, Math.max(...weeks));
  if (!source?.board) return 0;
  const positions = flattenDraftBoard(source.board)
    .map((slot, index) => (slot.managerId === managerId ? index : null))
    .filter((index) => index !== null);
  return positions.length ? Math.max(...positions) : 0;
}

/** Standings: active managers sorted by cumulative total desc, then by roster-points-only,
 *  then by draft disadvantage (later worst-pick slot wins), then alphabetical by name as the
 *  final, near-never-reached fallback. */
export function computeStandings(state) {
  const totals = computeCumulativeTotals(state);
  return state.managers
    .filter((m) => m.active)
    .map((m) => ({
      managerId: m.id,
      name: m.name,
      total: totals.get(m.id) ?? 0,
      rosterPointsOnly: tiebreakRosterPointsOnly(state, m.id),
      draftDisadvantage: tiebreakDraftDisadvantage(state, m.id),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.rosterPointsOnly - a.rosterPointsOnly ||
        b.draftDisadvantage - a.draftDisadvantage ||
        a.name.localeCompare(b.name)
    );
}

/** Draft order for the next weekly redraft: reverse standings (last place first). Only
 *  meaningful once the triggering episode is finalized and rosters aren't frozen. */
export function computeNextDraftOrder(state) {
  if (state.meta.rosterFrozen) return null;
  return computeStandings(state)
    .slice()
    .reverse()
    .map((s) => s.managerId);
}

/** Roster size for the next draft, per the dynamic/floored formula (plan §2.8, draft.js). */
export function computeEligibleCastIds(state) {
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  return state.cast.filter((c) => !eliminationEpisodes.has(c.id)).map((c) => c.id);
}

/** Total season points per cast member, summed across all finalized episodes — not tied to any
 *  one manager, just a per-cast-member summary (for the Cast Browser). Includes the
 *  Survived-the-Week bonus whenever a cast member was on ANY manager's roster that week. */
export function computeCastSeasonPoints(state) {
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  const points = new Map(state.cast.map((c) => [c.id, 0]));
  for (const week of finalizedWeeks(state)) {
    const episode = state.episodes.find((e) => e.episodeNumber === week);
    const rosteredThisWeek = allRosteredCastIdsForWeek(state, week);
    for (const cast of state.cast) {
      points.set(cast.id, points.get(cast.id) + computeCastPointsForEpisode(episode, cast.id, rosteredThisWeek.has(cast.id), eliminationEpisodes));
    }
  }
  return points;
}

/** Per-week point breakdown for a single cast member, one entry per finalized episode (oldest
 *  first): each logged event type that week (grouped, with its count and subtotal), the derived
 *  Survived-the-Week bonus if earned, and the week's total (kept consistent with
 *  computeCastPointsForEpisode/computeCastSeasonPoints above rather than re-derived by hand).
 *  Used for the cast detail modal's week-by-week stats. */
export function computeCastPointsBreakdownByWeek(state, castId) {
  const eliminationEpisodes = computeEliminationEpisodes(state.episodes);
  return finalizedWeeks(state)
    .slice()
    .sort((a, b) => a - b)
    .map((week) => {
      const episode = state.episodes.find((e) => e.episodeNumber === week);
      const rosteredThisWeek = allRosteredCastIdsForWeek(state, week).has(castId);
      const eventsByType = new Map();
      for (const event of episode.scoringEvents ?? []) {
        if (event.castId !== castId) continue;
        const count = event.count ?? 1;
        const entry = eventsByType.get(event.type) ?? { count: 0, points: 0 };
        entry.count += count;
        entry.points += (SCORING_EVENT_POINTS[event.type] ?? 0) * count;
        eventsByType.set(event.type, entry);
      }
      const eliminatedThisEpisode = isEliminatedAsOf(castId, week, eliminationEpisodes);
      const survivedBonus = rosteredThisWeek && !eliminatedThisEpisode ? SURVIVED_WEEK_POINTS : 0;
      return {
        week,
        events: [...eventsByType.entries()].map(([type, { count, points }]) => ({ type, count, points })),
        survivedBonus,
        eliminatedThisEpisode,
        total: computeCastPointsForEpisode(episode, castId, rosteredThisWeek, eliminationEpisodes),
      };
    });
}

/** Season-end only: preseason bonus pick points + final challenge points, per manager.
 *  Preseason bonus rewards correctly *predicting* 1st/2nd/3rd (regardless of roster); final
 *  challenge points reward whoever actually *rostered* the winner/2nd/3rd on their final
 *  roster — same roster-ownership pattern as every other scoring event in this file. */
export function computeSeasonEndBonusPoints(state) {
  const bonus = new Map(state.managers.map((m) => [m.id, 0]));
  if (!state.finalChallenge?.completed) return bonus;

  const { winner, second, third } = state.finalChallenge;
  for (const pick of state.preseasonPicks ?? []) {
    let points = 0;
    if (pick.first === winner) points += PRESEASON_BONUS_POINTS.first;
    if (pick.second === second) points += PRESEASON_BONUS_POINTS.second;
    if (pick.third === third) points += PRESEASON_BONUS_POINTS.third;
    bonus.set(pick.managerId, (bonus.get(pick.managerId) ?? 0) + points);
  }

  const weeks = finalizedWeeks(state);
  const lastWeek = weeks.length ? Math.max(...weeks) : null;
  if (lastWeek !== null) {
    for (const [managerId, castIds] of getRosterForWeek(state, lastWeek)) {
      let points = 0;
      if (castIds.includes(winner)) points += FINAL_CHALLENGE_POINTS.winner;
      if (castIds.includes(second)) points += FINAL_CHALLENGE_POINTS.second;
      if (castIds.includes(third)) points += FINAL_CHALLENGE_POINTS.third;
      bonus.set(managerId, (bonus.get(managerId) ?? 0) + points);
    }
  }
  return bonus;
}

/** Full leaderboard view model: per-manager breakdown for the current state of the season. */
export function computeLeaderboard(state) {
  const standings = computeStandings(state);
  const bonusPoints = computeSeasonEndBonusPoints(state);
  const weeks = finalizedWeeks(state);
  const currentWeek = weeks.length ? Math.max(...weeks) : null;

  return standings.map((s, index) => ({
    ...s,
    rank: index + 1,
    thisWeekRosterPoints: currentWeek ? computeRosterPointsForManagerWeek(state, s.managerId, currentWeek) : 0,
    thisWeekSafePickPoints: currentWeek ? computeSafePickPointsForManagerWeek(state, s.managerId, currentWeek) : 0,
    bonusPoints: bonusPoints.get(s.managerId) ?? 0,
    grandTotal: s.total + (bonusPoints.get(s.managerId) ?? 0),
  }));
}
