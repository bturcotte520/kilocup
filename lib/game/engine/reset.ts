import type { EngineConfig, MatchState, Player } from "./engineTypes";

/**
 * Repositions both teams into a simple kickoff shape and resets velocities/possession.
 * Home (kilo) is on the left attacking right (+x). Away (cpu) on the right attacking left (-x).
 */
export function resetToKickoff(config: EngineConfig, match: MatchState) {
  const { teamsById } = match;
  const home = teamsById[match.homeTeamId];
  const away = teamsById[match.awayTeamId];

  // Clear possession/ball ownership
  match.ball.ownerPlayerId = null;
  match.ball.lastTouchTeamId = null;
  match.ball.lastKickPlayerId = null;
  match.ball.kickNoPickupMs = 0;
  match.ball.pos.x = 0;
  match.ball.pos.y = 0;
  match.ball.vel.x = 0;
  match.ball.vel.y = 0;

  match.possession.teamId = null;
  match.possession.playerId = null;

  for (const p of [...home.players, ...away.players]) {
    p.vel.x = 0;
    p.vel.y = 0;
    p.hasBall = false;
  }

  // Very simple formation anchors (5v5)
  placeTeamKickoff(config, home.players, "left");
  placeTeamKickoff(config, away.players, "right");

  // Ensure controlled player remains non-GK; fallback to MF if present
  const controlled = match.playersById[match.controlledPlayerId];
  if (!controlled || controlled.teamId !== match.humanTeamId || controlled.role === "GK") {
    const humanTeam = teamsById[match.humanTeamId];
    const mf = humanTeam.players.find((p) => p.role === "MF");
    match.controlledPlayerId =
      mf?.id ?? humanTeam.players.find((p) => p.role !== "GK")?.id ?? humanTeam.players[0].id;
  }
}

function placeTeamKickoff(config: EngineConfig, players: Player[], side: "left" | "right") {
  const xSign = side === "left" ? -1 : 1;
  const x0 = xSign * config.pitchW * 0.42;
  const x1 = xSign * config.pitchW * 0.22;
  const x2 = xSign * config.pitchW * 0.08;

  // Place by role
  const gk = players.find((p) => p.role === "GK");
  const df = players.find((p) => p.role === "DF");
  const mf = players.find((p) => p.role === "MF");
  const fws = players.filter((p) => p.role === "FW");

  if (gk) setPos(gk, x0, 0);
  if (df) setPos(df, x1, side === "left" ? -12 : 12);
  if (mf) setPos(mf, x2, 0);

  if (fws[0]) setPos(fws[0], xSign * config.pitchW * 0.02, -10);
  if (fws[1]) setPos(fws[1], xSign * config.pitchW * 0.02, 10);

  // Facing
  for (const p of players) p.facingRad = side === "left" ? 0 : Math.PI;
}

function setPos(p: Player, x: number, y: number) {
  p.pos.x = x;
  p.pos.y = y;
}