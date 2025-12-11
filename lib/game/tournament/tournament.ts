import type { Score } from "@/lib/game/engine/engineTypes";
import type { Country } from "@/lib/data/countries";
import { COUNTRIES_32, KILO_TEAM } from "@/lib/data/countries";
import type {
  Bracket,
  BracketMatch,
  Fixture,
  Group,
  GroupId,
  KnockoutRound,
  StandingsRow,
  TournamentMatchDescriptor,
  TournamentState,
  TournamentTeam,
} from "./types";

const GROUP_IDS: GroupId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Simple deterministic PRNG (xorshift32) for shuffles + random tiebreak fallback.
 * Not cryptographically secure; intended only for deterministic gameplay flavor.
 */
export function makeRng(seed: number) {
  let x = seed | 0;
  if (x === 0) x = 0x6d2b79f5;

  const nextU32 = () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // ensure unsigned
    return (x >>> 0) as number;
  };

  const nextFloat = () => nextU32() / 0xffffffff;

  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(nextFloat() * arr.length)]!;

  return { nextU32, nextFloat, pick };
}

function shuffleInPlace<T>(arr: T[], seed: number) {
  const rng = makeRng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * Tournament teams:
 * - 31 countries + Kilo (total 32).
 *
 * Notes:
 * - We intentionally exclude one country from [`COUNTRIES_32`](lib/data/countries.ts:1) to keep the
 *   bracket at 32 with Kilo included.
 * - This aligns with the “Kilo is a team concept (not a country)” requirement while preserving
 *   opponents as countries.
 */
export function buildTournamentTeams(seed: number, countries: Country[] = COUNTRIES_32): TournamentTeam[] {
  const list = [...countries];
  shuffleInPlace(list, seed ^ 0x51c8_1a23);

  // Drop 1 country (deterministic) so we can add Kilo and still have 32 total.
  const selectedCountries = list.slice(0, 31);

  const teams: TournamentTeam[] = selectedCountries.map((c) => ({
    kind: "country",
    id: c.code3,
    code3: c.code3,
    name: c.name,
    flag: c.flag,
  }));

  teams.push({
    kind: "team",
    id: KILO_TEAM.id,
    code3: KILO_TEAM.code3,
    name: KILO_TEAM.name,
    flag: KILO_TEAM.flag,
  });

  // Final shuffle so Kilo doesn't always land at the end.
  shuffleInPlace(teams, seed ^ 0x9e37_79b9);

  return teams;
}

function makeEmptyRow(teamId: string): StandingsRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    headToHead: {},
    fairPlay: 0,
  };
}

function applyResultToRows(rows: Record<string, StandingsRow>, homeId: string, awayId: string, score: Score) {
  const home = rows[homeId]!;
  const away = rows[awayId]!;

  const homeGoals = score.home;
  const awayGoals = score.away;

  home.played += 1;
  away.played += 1;

  home.gf += homeGoals;
  home.ga += awayGoals;
  away.gf += awayGoals;
  away.ga += homeGoals;

  home.gd = home.gf - home.ga;
  away.gd = away.gf - away.ga;

  if (homeGoals > awayGoals) {
    home.won += 1;
    away.lost += 1;
    home.points += 3;

    addH2H(home, awayId, { points: 3, gd: homeGoals - awayGoals, gf: homeGoals });
    addH2H(away, homeId, { points: 0, gd: awayGoals - homeGoals, gf: awayGoals });
  } else if (homeGoals < awayGoals) {
    away.won += 1;
    home.lost += 1;
    away.points += 3;

    addH2H(home, awayId, { points: 0, gd: homeGoals - awayGoals, gf: homeGoals });
    addH2H(away, homeId, { points: 3, gd: awayGoals - homeGoals, gf: awayGoals });
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;

    addH2H(home, awayId, { points: 1, gd: 0, gf: homeGoals });
    addH2H(away, homeId, { points: 1, gd: 0, gf: awayGoals });
  }
}

function addH2H(
  row: StandingsRow,
  oppTeamId: string,
  delta: { points: number; gd: number; gf: number },
) {
  const cur = row.headToHead[oppTeamId] ?? { points: 0, gd: 0, gf: 0 };
  row.headToHead[oppTeamId] = {
    points: cur.points + delta.points,
    gd: cur.gd + delta.gd,
    gf: cur.gf + delta.gf,
  };
}

/**
 * Computes the group standings table from fixtures, applying deterministic tie-breaks.
 *
 * Tiebreaker order (per spec):
 * 1) Points
 * 2) Goal difference (GD)
 * 3) Goals for (GF)
 * 4) Head-to-head points among tied teams
 * 5) Head-to-head GD among tied teams
 * 6) Head-to-head GF among tied teams
 * 7) Fair play (lower better; currently constant 0)
 * 8) Random (seeded PRNG)
 */
export function computeGroupTable(args: {
  groupId: GroupId;
  teamIds: readonly string[];
  fixtures: readonly Fixture[];
  seed: number;
}): StandingsRow[] {
  const { teamIds, fixtures, seed } = args;

  const rows: Record<string, StandingsRow> = {};
  for (const id of teamIds) rows[id] = makeEmptyRow(id);

  for (const f of fixtures) {
    if (!f.result) continue;
    applyResultToRows(rows, f.homeTeamId, f.awayTeamId, f.result);
  }

  const base = teamIds.map((id) => rows[id]!);

  // Primary sort (1-3)
  const primarySorted = [...base].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return 0;
  });

  // Resolve ties via head-to-head, fair play, then seeded random.
  const resolved: StandingsRow[] = [];
  let i = 0;
  while (i < primarySorted.length) {
    const start = i;
    const a = primarySorted[i]!;
    while (i < primarySorted.length) {
      const x = primarySorted[i]!;
      if (x.points !== a.points || x.gd !== a.gd || x.gf !== a.gf) break;
      i++;
    }
    const tieGroup = primarySorted.slice(start, i);
    if (tieGroup.length <= 1) {
      resolved.push(...tieGroup);
      continue;
    }

    resolved.push(...breakTieGroup(tieGroup, fixtures, seed));
  }

  return resolved;
}

function breakTieGroup(tied: StandingsRow[], fixtures: readonly Fixture[], seed: number): StandingsRow[] {
  const tiedIds = new Set(tied.map((r) => r.teamId));

  // Build mini-table among tied teams (based on the actual recorded fixtures).
  const mini: Record<string, { points: number; gd: number; gf: number; fairPlay: number }> = {};
  for (const r of tied) {
    mini[r.teamId] = { points: 0, gd: 0, gf: 0, fairPlay: r.fairPlay };
  }

  for (const f of fixtures) {
    if (!f.result) continue;
    if (!tiedIds.has(f.homeTeamId) || !tiedIds.has(f.awayTeamId)) continue;

    const h = mini[f.homeTeamId]!;
    const a = mini[f.awayTeamId]!;

    const hg = f.result.home;
    const ag = f.result.away;

    h.gf += hg;
    a.gf += ag;

    h.gd += hg - ag;
    a.gd += ag - hg;

    if (hg > ag) h.points += 3;
    else if (hg < ag) a.points += 3;
    else {
      h.points += 1;
      a.points += 1;
    }
  }

  const rng = makeRng(seed ^ 0x2c1b_3c6d);

  const randKey = (teamId: string) => {
    // Mix seed + teamId into a stable u32 for ordering.
    let h = seed >>> 0;
    for (let i = 0; i < teamId.length; i++) {
      h = (h * 16777619) ^ teamId.charCodeAt(i);
      h >>>= 0;
    }
    // One extra PRNG step for diffusion.
    const local = makeRng(h ^ 0x85eb_ca6b);
    return local.nextU32();
  };

  const sorted = [...tied].sort((ra, rb) => {
    const a = mini[ra.teamId]!;
    const b = mini[rb.teamId]!;

    // 4-6: head-to-head
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;

    // 7: fair play (lower better)
    if (a.fairPlay !== b.fairPlay) return a.fairPlay - b.fairPlay;

    // 8: random (seeded)
    const ka = randKey(ra.teamId);
    const kb = randKey(rb.teamId);
    if (ka !== kb) return ka < kb ? -1 : 1;

    // fallback stable
    return ra.teamId < rb.teamId ? -1 : 1;
  });

  // Consume rng so the function isn't "purely hash-based" (minor entropy), but still deterministic
  // and does not affect ordering for stable inputs.
  rng.nextU32();

  return sorted;
}

export function generateGroupFixtures(groupId: GroupId, teamIds: [string, string, string, string]): Fixture[] {
  const [t0, t1, t2, t3] = teamIds;

  // Round-robin for 4 teams => 6 matches.
  const pairings: Array<[string, string]> = [
    [t0, t1],
    [t2, t3],
    [t0, t2],
    [t3, t1],
    [t0, t3],
    [t1, t2],
  ];

  return pairings.map(([homeTeamId, awayTeamId], idx) => ({
    id: `group:${groupId}:m${idx + 1}`,
    groupId,
    homeTeamId,
    awayTeamId,
    result: null,
  }));
}

export function generateGroups(seed: number, teams: TournamentTeam[]): Record<GroupId, Group> {
  if (teams.length !== 32) {
    throw new Error(`Tournament requires 32 teams, got ${teams.length}`);
  }

  // Deterministic shuffle before chunking into groups.
  const ordered = [...teams];
  shuffleInPlace(ordered, seed ^ 0x4b1d_1f9a);

  const groups = {} as Record<GroupId, Group>;

  for (let gi = 0; gi < GROUP_IDS.length; gi++) {
    const id = GROUP_IDS[gi]!;
    const chunk = ordered.slice(gi * 4, gi * 4 + 4).map((t) => t.id) as [string, string, string, string];
    const fixtures = generateGroupFixtures(id, chunk);

    groups[id] = {
      id,
      teamIds: chunk,
      fixtures,
      table: computeGroupTable({ groupId: id, teamIds: chunk, fixtures, seed }),
    };
  }

  return groups;
}

function simulateGroupMatchScore(args: { seed: number; homeTeamId: string; awayTeamId: string }): Score {
  const { seed, homeTeamId, awayTeamId } = args;
  const rng = makeRng(seed ^ hashIds(homeTeamId, awayTeamId, "GROUP"));

  // 0..3 goals, mild home advantage via extra roll.
  const h = Math.floor(rng.nextFloat() * 4);
  const aBase = Math.floor(rng.nextFloat() * 4);
  const a = rng.nextFloat() < 0.08 ? Math.max(0, aBase - 1) : aBase;

  return { home: h, away: a };
}

function simulateKnockoutMatchScore(args: { seed: number; homeTeamId: string; awayTeamId: string }): { score: Score; winnerTeamId: string } {
  const { seed, homeTeamId, awayTeamId } = args;
  const rng = makeRng(seed ^ hashIds(homeTeamId, awayTeamId, "KNOCKOUT"));

  let home = Math.floor(rng.nextFloat() * 4);
  let away = Math.floor(rng.nextFloat() * 4);

  if (home === away) {
    // "penalties": coin flip winner, add one goal for deterministic winner.
    const homeWins = rng.nextFloat() < 0.5;
    if (homeWins) home += 1;
    else away += 1;
  }

  const winnerTeamId = home > away ? homeTeamId : awayTeamId;
  return { score: { home, away }, winnerTeamId };
}

function hashIds(a: string, b: string, tag: string): number {
  let h = 2166136261;
  const s = `${tag}:${a}:${b}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isGroupComplete(groups: Record<GroupId, Group>): boolean {
  for (const g of Object.values(groups)) {
    for (const f of g.fixtures) {
      if (!f.result) return false;
    }
  }
  return true;
}

function buildEmptyBracket(): Bracket {
  return { r16: [], qf: [], sf: [], f: [] };
}

export function buildR16FromGroups(args: {
  groups: Record<GroupId, Group>;
  seed: number;
}): BracketMatch[] {
  const { groups, seed } = args;

  // Ensure tables are up to date.
  const tables: Record<GroupId, StandingsRow[]> = {} as Record<GroupId, StandingsRow[]>;
  for (const id of GROUP_IDS) {
    const g = groups[id];
    tables[id] = computeGroupTable({ groupId: id, teamIds: g.teamIds, fixtures: g.fixtures, seed });
  }

  const A1 = tables.A[0]!.teamId;
  const A2 = tables.A[1]!.teamId;
  const B1 = tables.B[0]!.teamId;
  const B2 = tables.B[1]!.teamId;
  const C1 = tables.C[0]!.teamId;
  const C2 = tables.C[1]!.teamId;
  const D1 = tables.D[0]!.teamId;
  const D2 = tables.D[1]!.teamId;
  const E1 = tables.E[0]!.teamId;
  const E2 = tables.E[1]!.teamId;
  const F1 = tables.F[0]!.teamId;
  const F2 = tables.F[1]!.teamId;
  const G1 = tables.G[0]!.teamId;
  const G2 = tables.G[1]!.teamId;
  const H1 = tables.H[0]!.teamId;
  const H2 = tables.H[1]!.teamId;

  const pairings: Array<[string, string]> = [
    [A1, B2],
    [C1, D2],
    [E1, F2],
    [G1, H2],
    [B1, A2],
    [D1, C2],
    [F1, E2],
    [H1, G2],
  ];

  return pairings.map(([homeTeamId, awayTeamId], slot) => ({
    id: `bracket:R16:${slot}`,
    round: "R16",
    slot,
    homeTeamId,
    awayTeamId,
    result: null,
    winnerTeamId: null,
  }));
}

function buildNextRound(prevRound: BracketMatch[], round: KnockoutRound): BracketMatch[] {
  const out: BracketMatch[] = [];
  const pairs = prevRound.length / 2;

  for (let i = 0; i < pairs; i++) {
    out.push({
      id: `bracket:${round}:${i}`,
      round,
      slot: i,
      homeTeamId: null,
      awayTeamId: null,
      result: null,
      winnerTeamId: null,
    });
  }

  return out;
}

function fillRoundTeamsFromWinners(args: { prev: BracketMatch[]; next: BracketMatch[] }) {
  const { prev, next } = args;

  for (let i = 0; i < next.length; i++) {
    const p0 = prev[i * 2];
    const p1 = prev[i * 2 + 1];
    if (!p0 || !p1) continue;

    next[i]!.homeTeamId = p0.winnerTeamId;
    next[i]!.awayTeamId = p1.winnerTeamId;
  }
}

export function initTournament(seed: number = 2026): TournamentState {
  const teams = buildTournamentTeams(seed);

  const teamsById: Record<string, TournamentTeam> = {};
  for (const t of teams) teamsById[t.id] = t;

  const groups = generateGroups(seed, teams);

  // Initial state points at the first playable match (Kilo), after simulating other matches up to it.
  const state: TournamentState = {
    edition: "2026",
    seed,
    teamsById,
    stage: "GROUP",
    groups,
    bracket: buildEmptyBracket(),
    currentMatchId: null,
    completedMatchIds: [],
    winnerTeamId: null,
  };

  return advanceToNextPlayableMatch(state);
}

export function getCurrentMatchDescriptor(state: TournamentState): TournamentMatchDescriptor | null {
  if (!state.currentMatchId) return null;

  if (state.stage === "GROUP") {
    for (const g of Object.values(state.groups)) {
      const f = g.fixtures.find((x) => x.id === state.currentMatchId);
      if (!f) continue;
      return {
        kind: "GROUP",
        matchId: f.id,
        groupId: g.id,
        fixtureId: f.id,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
      };
    }
    return null;
  }

  if (state.stage === "KNOCKOUT") {
    const rounds: Array<[KnockoutRound, BracketMatch[]]> = [
      ["R16", state.bracket.r16],
      ["QF", state.bracket.qf],
      ["SF", state.bracket.sf],
      ["F", state.bracket.f],
    ];

    for (const [round, ms] of rounds) {
      const m = ms.find((x) => x.id === state.currentMatchId);
      if (!m || !m.homeTeamId || !m.awayTeamId) continue;

      return {
        kind: "KNOCKOUT",
        matchId: m.id,
        round,
        slot: m.slot,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
      };
    }
    return null;
  }

  return null;
}

export function applyPlayedMatchResult(args: {
  state: TournamentState;
  // score from the engine, where Kilo is always "home".
  engineScore: Score;
  kiloTeamId?: string;
}): TournamentState {
  const { state, engineScore } = args;
  const kiloTeamId = args.kiloTeamId ?? "kilo";
  const cur = getCurrentMatchDescriptor(state);
  if (!cur) return state;

  // Map engine score (Kilo home) into tournament home/away orientation.
  const tournamentScore: Score =
    cur.homeTeamId === kiloTeamId ? engineScore : { home: engineScore.away, away: engineScore.home };

  let next: TournamentState = state;

  if (cur.kind === "GROUP") {
    next = setGroupFixtureResult(next, cur.fixtureId, tournamentScore);
  } else {
    next = setBracketMatchResult(next, cur.matchId, tournamentScore);
  }

  next = {
    ...next,
    completedMatchIds: next.completedMatchIds.includes(cur.matchId)
      ? next.completedMatchIds
      : [...next.completedMatchIds, cur.matchId],
  };

  return advanceToNextPlayableMatch(next);
}

function setGroupFixtureResult(state: TournamentState, fixtureId: string, result: Score): TournamentState {
  const groups: Record<GroupId, Group> = { ...state.groups };

  for (const gid of GROUP_IDS) {
    const g = groups[gid];
    const idx = g.fixtures.findIndex((f) => f.id === fixtureId);
    if (idx < 0) continue;

    const fixtures = g.fixtures.map((f, i) => (i === idx ? { ...f, result } : f));
    const table = computeGroupTable({ groupId: gid, teamIds: g.teamIds, fixtures, seed: state.seed });

    groups[gid] = { ...g, fixtures, table };
    return { ...state, groups };
  }

  return state;
}

function setBracketMatchResult(state: TournamentState, matchId: string, result: Score): TournamentState {
  const bracket: Bracket = {
    r16: state.bracket.r16,
    qf: state.bracket.qf,
    sf: state.bracket.sf,
    f: state.bracket.f,
  };

  const applyToRound = (round: BracketMatch[]) => {
    const idx = round.findIndex((m) => m.id === matchId);
    if (idx < 0) return round;

    const m = round[idx]!;
    if (!m.homeTeamId || !m.awayTeamId) return round;

    const winnerTeamId = result.home > result.away ? m.homeTeamId : m.awayTeamId;
    const updated = { ...m, result, winnerTeamId };
    return round.map((x, i) => (i === idx ? updated : x));
  };

  const r16 = applyToRound(state.bracket.r16);
  const qf = applyToRound(state.bracket.qf);
  const sf = applyToRound(state.bracket.sf);
  const f = applyToRound(state.bracket.f);

  return { ...state, bracket: { r16, qf, sf, f } };
}

/**
 * Moves the tournament forward:
 * - Auto-simulates every non-Kilo match until the next Kilo match is found.
 * - Transitions from GROUP -> KNOCKOUT when all group fixtures are complete.
 * - Progresses through bracket rounds, auto-simming non-Kilo matches and advancing winners.
 */
export function advanceToNextPlayableMatch(state: TournamentState, kiloTeamId: string = "kilo"): TournamentState {
  let next = state;

  if (next.stage === "GROUP") {
    next = autoSimGroupsUntilPlayable(next, kiloTeamId);
    if (!next.currentMatchId && isGroupComplete(next.groups)) {
      next = startKnockoutStage(next);
      next = autoSimBracketUntilPlayable(next, kiloTeamId);
    }
    return next;
  }

  if (next.stage === "KNOCKOUT") {
    next = autoSimBracketUntilPlayable(next, kiloTeamId);

    const final = next.bracket.f[0];
    if (final?.winnerTeamId) {
      return { ...next, stage: "COMPLETE", currentMatchId: null, winnerTeamId: final.winnerTeamId };
    }

    return next;
  }

  return next;
}

function autoSimGroupsUntilPlayable(state: TournamentState, kiloTeamId: string): TournamentState {
  // deterministic order: groups A..H, fixtures m1..m6
  for (const gid of GROUP_IDS) {
    const g = state.groups[gid];
    for (const f of g.fixtures) {
      if (f.result) continue;

      const isPlayable = f.homeTeamId === kiloTeamId || f.awayTeamId === kiloTeamId;
      if (isPlayable) {
        return { ...state, currentMatchId: f.id };
      }

      const score = simulateGroupMatchScore({ seed: state.seed, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId });
      state = setGroupFixtureResult(state, f.id, score);
      state = {
        ...state,
        completedMatchIds: state.completedMatchIds.includes(f.id) ? state.completedMatchIds : [...state.completedMatchIds, f.id],
      };
    }
  }

  return { ...state, currentMatchId: null };
}

function startKnockoutStage(state: TournamentState): TournamentState {
  // Recompute tables to ensure correct qualifiers.
  const groups: Record<GroupId, Group> = { ...state.groups };
  for (const gid of GROUP_IDS) {
    const g = groups[gid];
    groups[gid] = {
      ...g,
      table: computeGroupTable({ groupId: gid, teamIds: g.teamIds, fixtures: g.fixtures, seed: state.seed }),
    };
  }

  const r16 = buildR16FromGroups({ groups, seed: state.seed });
  const qf = buildNextRound(r16, "QF");
  const sf = buildNextRound(qf, "SF");
  const f = buildNextRound(sf, "F");

  return {
    ...state,
    stage: "KNOCKOUT",
    groups,
    bracket: { r16, qf, sf, f },
    currentMatchId: null,
  };
}

function autoSimBracketUntilPlayable(state: TournamentState, kiloTeamId: string): TournamentState {
  let bracket = { ...state.bracket };

  const rounds: Array<[KnockoutRound, keyof Bracket]> = [
    ["R16", "r16"],
    ["QF", "qf"],
    ["SF", "sf"],
    ["F", "f"],
  ];

  for (let ri = 0; ri < rounds.length; ri++) {
    const [round, key] = rounds[ri]!;
    const matches = [...bracket[key]];

    // Ensure teams are filled from previous round winners (except R16).
    if (round === "QF") fillRoundTeamsFromWinners({ prev: bracket.r16, next: matches });
    if (round === "SF") fillRoundTeamsFromWinners({ prev: bracket.qf, next: matches });
    if (round === "F") fillRoundTeamsFromWinners({ prev: bracket.sf, next: matches });

    // Write back filled teams
    bracket = { ...bracket, [key]: matches } as Bracket;

    for (const m of matches) {
      if (m.result) continue;
      if (!m.homeTeamId || !m.awayTeamId) continue;

      const isPlayable = m.homeTeamId === kiloTeamId || m.awayTeamId === kiloTeamId;
      if (isPlayable) {
        return { ...state, bracket, currentMatchId: m.id };
      }

      const sim = simulateKnockoutMatchScore({ seed: state.seed, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId });
      state = setBracketMatchResult({ ...state, bracket }, m.id, sim.score);
      state = {
        ...state,
        completedMatchIds: state.completedMatchIds.includes(m.id) ? state.completedMatchIds : [...state.completedMatchIds, m.id],
      };

      bracket = state.bracket;
    }
  }

  return { ...state, bracket, currentMatchId: null };
}

/**
 * Convenience for UI/host code: returns the opponent team id for Kilo in the current match.
 */
export function getKiloOpponentTeamId(state: TournamentState, kiloTeamId: string = "kilo"): string | null {
  const cur = getCurrentMatchDescriptor(state);
  if (!cur) return null;
  if (cur.homeTeamId === kiloTeamId) return cur.awayTeamId;
  if (cur.awayTeamId === kiloTeamId) return cur.homeTeamId;
  return null;
}