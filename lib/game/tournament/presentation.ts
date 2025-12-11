import type { Team } from "@/lib/game/engine/engineTypes";
import type {
  Bracket,
  BracketMatch,
  GroupId,
  KnockoutRound,
  StandingsRow,
  TournamentMatchDescriptor,
  TournamentState,
  TournamentTeam,
} from "./types";

export type KitColors = Team["kit"];

export type TeamDisplay = {
  id: string;
  code3: string;
  name: string;
  flag: string;
  kit: KitColors;
};

export type StandingsRowVM = {
  team: TeamDisplay;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  isKilo: boolean;
};

export type BracketMatchVM = {
  id: string;
  round: KnockoutRound;
  roundLabel: string;
  slot: number;

  home: TeamDisplay | null;
  away: TeamDisplay | null;

  played: boolean;
  resultText: string | null;
  winnerTeamId: string | null;

  highlightKiloPath: boolean;
};

export type TournamentOutcomeVM =
  | { status: "IN_PROGRESS" }
  | { status: "CHAMPION" }
  | { status: "ELIMINATED"; reachedStageLabel: string };

/**
 * Deterministically generates readable kit colors for an opponent team from its id.
 * Kilo's kit is defined in [`lib/game/engine/createMatch.ts`](lib/game/engine/createMatch.ts:1).
 */
export function kitForTeamId(teamId: string): KitColors {
  const h = hashToHue(teamId);

  // Primary: saturated mid-brightness
  const primary = hslToHex(h, 75, 52);

  // Secondary: darker outline for contrast
  const secondary = hslToHex((h + 18) % 360, 55, 24);

  return { primary, secondary };
}

export function kitForTournamentTeam(team: TournamentTeam): KitColors {
  return kitForTeamId(team.id);
}

export function tournamentMatchStageLabel(desc: TournamentMatchDescriptor | null): string {
  if (!desc) return "Tournament";

  if (desc.kind === "GROUP") return `Group ${desc.groupId}`;

  if (desc.round === "R16") return "Round of 16";
  if (desc.round === "QF") return "Quarterfinal";
  if (desc.round === "SF") return "Semifinal";
  return "Final";
}

export function knockoutRoundShortLabel(round: KnockoutRound): string {
  if (round === "R16") return "R16";
  if (round === "QF") return "QF";
  if (round === "SF") return "SF";
  return "Final";
}

export function getKiloGroupId(state: TournamentState, kiloTeamId: string = "kilo"): GroupId | null {
  for (const [gid, g] of Object.entries(state.groups) as Array<[GroupId, TournamentState["groups"][GroupId]]>) {
    if (g.teamIds.includes(kiloTeamId as any)) return gid;
  }
  return null;
}

export function getGroupStandingsVM(args: {
  state: TournamentState;
  groupId: GroupId;
  kiloTeamId?: string;
}): StandingsRowVM[] {
  const { state, groupId } = args;
  const kiloTeamId = args.kiloTeamId ?? "kilo";

  const g = state.groups[groupId];
  if (!g) return [];

  return g.table.map((r) => {
    const team = toTeamDisplay(state, r.teamId);
    return {
      team,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      gf: r.gf,
      ga: r.ga,
      gd: r.gd,
      points: r.points,
      isKilo: r.teamId === kiloTeamId,
    };
  });
}

export function getBracketVM(args: { state: TournamentState; kiloTeamId?: string }): {
  r16: BracketMatchVM[];
  qf: BracketMatchVM[];
  sf: BracketMatchVM[];
  f: BracketMatchVM[];
  kiloPathMatchIds: string[];
} {
  const { state } = args;
  const kiloTeamId = args.kiloTeamId ?? "kilo";

  const kiloPathMatchIds = computeKiloPathMatchIds(state.bracket, kiloTeamId);

  const toVM = (m: BracketMatch): BracketMatchVM => {
    const home = m.homeTeamId ? toTeamDisplay(state, m.homeTeamId) : null;
    const away = m.awayTeamId ? toTeamDisplay(state, m.awayTeamId) : null;

    const played = !!m.result;
    const resultText = m.result ? `${m.result.home}–${m.result.away}` : null;

    return {
      id: m.id,
      round: m.round,
      roundLabel: knockoutRoundShortLabel(m.round),
      slot: m.slot,
      home,
      away,
      played,
      resultText,
      winnerTeamId: m.winnerTeamId,
      highlightKiloPath: kiloPathMatchIds.includes(m.id),
    };
  };

  return {
    r16: state.bracket.r16.map(toVM),
    qf: state.bracket.qf.map(toVM),
    sf: state.bracket.sf.map(toVM),
    f: state.bracket.f.map(toVM),
    kiloPathMatchIds,
  };
}

export function getTournamentOutcomeVM(state: TournamentState, kiloTeamId: string = "kilo"): TournamentOutcomeVM {
  if (state.stage !== "COMPLETE") return { status: "IN_PROGRESS" };

  if (state.winnerTeamId === kiloTeamId) return { status: "CHAMPION" };

  // If Kilo never appears in the R16, they were eliminated in the group stage (did not qualify).
  const kiloInR16 = state.bracket.r16.some((m) => m.homeTeamId === kiloTeamId || m.awayTeamId === kiloTeamId);
  if (!kiloInR16) return { status: "ELIMINATED", reachedStageLabel: "Group Stage" };

  // Otherwise, find the knockout match where Kilo lost.
  const knockoutLoss = findKiloKnockoutLossMatch(state.bracket, kiloTeamId);
  if (!knockoutLoss) return { status: "ELIMINATED", reachedStageLabel: "Knockout Stage" };

  const label =
    knockoutLoss.round === "R16"
      ? "Round of 16"
      : knockoutLoss.round === "QF"
        ? "Quarterfinal"
        : knockoutLoss.round === "SF"
          ? "Semifinal"
          : "Final";

  return { status: "ELIMINATED", reachedStageLabel: label };
}

function toTeamDisplay(state: TournamentState, teamId: string): TeamDisplay {
  const t = state.teamsById[teamId];
  if (!t) {
    return {
      id: teamId,
      code3: teamId.slice(0, 3).toUpperCase(),
      name: teamId,
      flag: "🏳️",
      kit: kitForTeamId(teamId),
    };
  }

  return {
    id: t.id,
    code3: t.code3,
    name: t.name,
    flag: t.flag,
    kit: kitForTournamentTeam(t),
  };
}

function computeKiloPathMatchIds(bracket: Bracket, kiloTeamId: string): string[] {
  const out: string[] = [];

  // Walk forward: find the match Kilo is in for each round (if present), then only highlight
  // subsequent rounds if Kilo has advanced (winner is Kilo and the next round has team slots filled).
  const r16 = findMatchForTeam(bracket.r16, kiloTeamId);
  if (!r16) return out;

  out.push(r16.id);
  if (r16.winnerTeamId !== kiloTeamId) return out;

  const qf = findMatchForTeam(bracket.qf, kiloTeamId);
  if (!qf) return out;

  out.push(qf.id);
  if (qf.winnerTeamId !== kiloTeamId) return out;

  const sf = findMatchForTeam(bracket.sf, kiloTeamId);
  if (!sf) return out;

  out.push(sf.id);
  if (sf.winnerTeamId !== kiloTeamId) return out;

  const f = findMatchForTeam(bracket.f, kiloTeamId);
  if (!f) return out;

  out.push(f.id);
  return out;
}

function findMatchForTeam(matches: readonly BracketMatch[], teamId: string): BracketMatch | null {
  for (const m of matches) {
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) return m;
  }
  return null;
}

function findKiloKnockoutLossMatch(bracket: Bracket, kiloTeamId: string): BracketMatch | null {
  const rounds: BracketMatch[][] = [bracket.r16, bracket.qf, bracket.sf, bracket.f];
  for (const ms of rounds) {
    for (const m of ms) {
      if (!m.result) continue;
      if (m.homeTeamId !== kiloTeamId && m.awayTeamId !== kiloTeamId) continue;
      if (m.winnerTeamId && m.winnerTeamId !== kiloTeamId) return m;
    }
  }
  return null;
}

function hashToHue(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  // https://en.wikipedia.org/wiki/HSL_and_HSV#HSL_to_RGB
  const S = s / 100;
  const L = l / 100;

  const C = (1 - Math.abs(2 * L - 1)) * S;
  const Hp = (h % 360) / 60;
  const X = C * (1 - Math.abs((Hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (0 <= Hp && Hp < 1) [r1, g1, b1] = [C, X, 0];
  else if (1 <= Hp && Hp < 2) [r1, g1, b1] = [X, C, 0];
  else if (2 <= Hp && Hp < 3) [r1, g1, b1] = [0, C, X];
  else if (3 <= Hp && Hp < 4) [r1, g1, b1] = [0, X, C];
  else if (4 <= Hp && Hp < 5) [r1, g1, b1] = [X, 0, C];
  else if (5 <= Hp && Hp < 6) [r1, g1, b1] = [C, 0, X];

  const m = L - C / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}