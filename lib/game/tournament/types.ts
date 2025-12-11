import type { Score } from "@/lib/game/engine/engineTypes";

export type GroupId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type TournamentStage = "GROUP" | "KNOCKOUT" | "COMPLETE";

export type KnockoutRound = "R16" | "QF" | "SF" | "F";

export type TournamentTeamBase = {
  id: string; // unique, stable (Kilo uses "kilo"; countries typically use their code3)
  code3: string;
  name: string;
  flag: string; // emoji
};

export type CountryTeam = TournamentTeamBase & {
  kind: "country";
};

export type KiloTeam = TournamentTeamBase & {
  kind: "team";
};

export type TournamentTeam = CountryTeam | KiloTeam;

export type StandingsRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;

  // for tiebreakers
  headToHead: Record<string, { points: number; gd: number; gf: number }>;
  fairPlay: number; // lower is better; can remain 0 for now
};

export type Fixture = {
  id: string;
  groupId: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  result: Score | null;
};

export type Group = {
  id: GroupId;
  teamIds: [string, string, string, string];
  fixtures: Fixture[];
  table: StandingsRow[];
};

export type BracketMatch = {
  id: string;
  round: KnockoutRound;
  slot: number; // 0..n-1

  homeTeamId: string | null;
  awayTeamId: string | null;

  result: Score | null;
  winnerTeamId: string | null;
};

export type Bracket = {
  r16: BracketMatch[];
  qf: BracketMatch[];
  sf: BracketMatch[];
  f: BracketMatch[];
};

export type TournamentState = {
  edition: "2026";

  seed: number;

  teamsById: Record<string, TournamentTeam>;

  stage: TournamentStage;

  groups: Record<GroupId, Group>;

  bracket: Bracket;

  // points at a match id in either group fixtures or bracket matches
  currentMatchId: string | null;

  completedMatchIds: string[];

  winnerTeamId: string | null;
};

export type TournamentMatchDescriptor =
  | {
      kind: "GROUP";
      matchId: string;
      groupId: GroupId;
      fixtureId: string;
      homeTeamId: string;
      awayTeamId: string;
    }
  | {
      kind: "KNOCKOUT";
      matchId: string;
      round: KnockoutRound;
      slot: number;
      homeTeamId: string;
      awayTeamId: string;
    };