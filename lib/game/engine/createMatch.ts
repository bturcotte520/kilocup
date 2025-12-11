import type { EngineConfig, MatchState, Player, PlayerRole, Team, Vec2 } from "./engineTypes";

export type MatchSetup = {
  away: {
    id: string;
    code3: string;
    name: string;
    flag: string;
    kit: Team["kit"];
  };
};

function pId(teamId: string, n: number) {
  return `${teamId}:p${n}`;
}

function makePlayer(args: {
  id: string;
  name: string;
  role: PlayerRole;
  teamId: string;
  pos: Vec2;
  maxSpeed: number;
  accel: number;
  kickPower: number;
}): Player {
  return {
    id: args.id,
    name: args.name,
    role: args.role,
    teamId: args.teamId,
    pos: { x: args.pos.x, y: args.pos.y },
    vel: { x: 0, y: 0 },
    facingRad: 0,
    stamina: 1,
    hasBall: false,
    maxSpeed: args.maxSpeed,
    accel: args.accel,
    kickPower: args.kickPower,
  };
}

/**
 * Coordinate convention:
 * - Pitch is centered at (0,0)
 * - X axis: left(-) to right(+)
 * - Y axis: top(-) to bottom(+)
 * - Goals are at x = +/- pitchW/2, mouth spans +/- goalHalfW around y=0
 */
export function createMatch(config: EngineConfig, setup?: MatchSetup): MatchState {
  const homeTeamId = "kilo";

  const away = setup?.away ?? {
    id: "cpu",
    code3: "CPU",
    name: "Opponent",
    flag: "🏳️",
    kit: { primary: "#B8C1CC", secondary: "#263238" }, // neutral
  };

  const awayTeamId = away.id;

  // 5v5: GK, DF, MF, FW, FW
  const homePlayers: Player[] = [
    makePlayer({
      id: pId(homeTeamId, 1),
      name: "Kilo GK",
      role: "GK",
      teamId: homeTeamId,
      pos: { x: -config.pitchW * 0.45, y: 0 },
      maxSpeed: 14,
      accel: 60,
      kickPower: 26,
    }),
    makePlayer({
      id: pId(homeTeamId, 2),
      name: "Kilo DF",
      role: "DF",
      teamId: homeTeamId,
      pos: { x: -config.pitchW * 0.25, y: -12 },
      maxSpeed: 16,
      accel: 70,
      kickPower: 28,
    }),
    makePlayer({
      id: pId(homeTeamId, 3),
      name: "Kilo MF",
      role: "MF",
      teamId: homeTeamId,
      pos: { x: -config.pitchW * 0.15, y: 0 },
      maxSpeed: 18,
      accel: 75,
      kickPower: 30,
    }),
    makePlayer({
      id: pId(homeTeamId, 4),
      name: "Kilo FW1",
      role: "FW",
      teamId: homeTeamId,
      pos: { x: -config.pitchW * 0.05, y: -14 },
      maxSpeed: 20,
      accel: 85,
      kickPower: 32,
    }),
    makePlayer({
      id: pId(homeTeamId, 5),
      name: "Kilo FW2",
      role: "FW",
      teamId: homeTeamId,
      pos: { x: -config.pitchW * 0.05, y: 14 },
      maxSpeed: 20,
      accel: 85,
      kickPower: 32,
    }),
  ];

  const awayPlayers: Player[] = [
    makePlayer({
      id: pId(awayTeamId, 1),
      name: `${away.code3} GK`,
      role: "GK",
      teamId: awayTeamId,
      pos: { x: config.pitchW * 0.45, y: 0 },
      maxSpeed: 14,
      accel: 60,
      kickPower: 26,
    }),
    makePlayer({
      id: pId(awayTeamId, 2),
      name: `${away.code3} DF`,
      role: "DF",
      teamId: awayTeamId,
      pos: { x: config.pitchW * 0.25, y: 12 },
      maxSpeed: 16,
      accel: 70,
      kickPower: 28,
    }),
    makePlayer({
      id: pId(awayTeamId, 3),
      name: `${away.code3} MF`,
      role: "MF",
      teamId: awayTeamId,
      pos: { x: config.pitchW * 0.15, y: 0 },
      maxSpeed: 18,
      accel: 75,
      kickPower: 30,
    }),
    makePlayer({
      id: pId(awayTeamId, 4),
      name: `${away.code3} FW1`,
      role: "FW",
      teamId: awayTeamId,
      pos: { x: config.pitchW * 0.05, y: 14 },
      maxSpeed: 20,
      accel: 85,
      kickPower: 32,
    }),
    makePlayer({
      id: pId(awayTeamId, 5),
      name: `${away.code3} FW2`,
      role: "FW",
      teamId: awayTeamId,
      pos: { x: config.pitchW * 0.05, y: -14 },
      maxSpeed: 20,
      accel: 85,
      kickPower: 32,
    }),
  ];

  // Home (Kilo) faces right (+x), away faces left (-x)
  for (const p of homePlayers) p.facingRad = 0;
  for (const p of awayPlayers) p.facingRad = Math.PI;

  const homeTeam: Team = {
    id: homeTeamId,
    code3: "KIL",
    name: "Kilo",
    flag: "🏆",
    kit: { primary: "#F6C945", secondary: "#111111" }, // yellow / near-black
    players: homePlayers,
    controlledBy: "human",
  };

  const awayTeam: Team = {
    id: awayTeamId,
    code3: away.code3,
    name: away.name,
    flag: away.flag,
    kit: away.kit,
    players: awayPlayers,
    controlledBy: "cpu",
  };

  const teamsById: Record<string, Team> = {
    [homeTeam.id]: homeTeam,
    [awayTeam.id]: awayTeam,
  };

  const playersById: Record<string, Player> = {};
  for (const t of Object.values(teamsById)) {
    for (const p of t.players) playersById[p.id] = p;
  }

  const controlledPlayerId = pId(homeTeamId, 3); // MF

  const match: MatchState = {
    id: "match:single",
    homeTeamId,
    awayTeamId,

    score: { home: 0, away: 0 },
    clock: {
      msElapsed: 0,
      msTotal: config.matchMsTotal,
      phase: "FIRST_HALF",
    },

    ball: {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 1.2,
      ownerPlayerId: null,
      lastTouchTeamId: null,

      lastKickPlayerId: null,
      kickNoPickupMs: 0,
    },

    playersById,
    teamsById,

    humanTeamId: homeTeamId,
    controlledPlayerId,

    possession: { teamId: null, playerId: null },
    lastEventText: null,
  };

  return match;
}