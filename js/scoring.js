// Pure computation engine (plan §2). Takes the whole `state` object and derives every
// point total fresh — nothing here is ever read from a stored "total" field, so there is
// no way for a cached number to drift from the raw events it should represent.
//
// Convention: week number === episode number (one episode airs per week, per the season
// format described in the plan). `drafts.preseason` supplies Week 1's rosters;
// `drafts.weekly[week]` supplies Week 2 onward.

export const SCORING_EVENT_POINTS = {
  WON_DAILY: 5,
  WON_ELIMINATION: 10,
  DQ_QUIT: -5,
  DQ_QUIT_INJURY: -15,
  CRIED: -5,
  MADE_OUT: 10,
  PUKED: -10,
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

/** Standings: active managers sorted by cumulative total desc, tiebreak by roster-points-only,
 *  then alphabetical by name (assumption #2 in the plan). */
export function computeStandings(state) {
  const totals = computeCumulativeTotals(state);
  return state.managers
    .filter((m) => m.active)
    .map((m) => ({
      managerId: m.id,
      name: m.name,
      total: totals.get(m.id) ?? 0,
      rosterPointsOnly: tiebreakRosterPointsOnly(state, m.id),
    }))
    .sort((a, b) => b.total - a.total || b.rosterPointsOnly - a.rosterPointsOnly || a.name.localeCompare(b.name));
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
