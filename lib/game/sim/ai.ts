import type { CpuAiState, EngineConfig, MatchState, Player, Team, Vec2 } from "../engine/engineTypes";
import { V } from "../math/vec2";
import { getGoalCenter, releaseBallWithKick } from "./physics";

export function createCpuAiState(): CpuAiState {
  return { shootCooldownMs: 0, dribbleJitterPhase: Math.random() * Math.PI * 2, chaserPlayerId: null };
}

export function stepCpuAi(args: {
  config: EngineConfig;
  match: MatchState;
  dtMs: number;
  cpuAi: CpuAiState;
}) {
  const { config, match, dtMs, cpuAi } = args;

  const cpuTeam = match.teamsById[match.awayTeamId];
  if (!cpuTeam) return;

  // Treat shootCooldownMs as a generic "kick cooldown" (applies to passes and shots).
  cpuAi.shootCooldownMs = Math.max(0, cpuAi.shootCooldownMs - dtMs);
  cpuAi.dribbleJitterPhase += (dtMs / 1000) * 1.4;

  // Reset each tick; we’ll set it below if we decide to chase.
  cpuAi.chaserPlayerId = null;

  // If CPU owns the ball, control that player; else pick closest non-GK to chase.
  const ownerId = match.ball.ownerPlayerId;
  const cpuOwner = ownerId ? match.playersById[ownerId] : null;
  const cpuHasBall = cpuOwner?.teamId === cpuTeam.id;

  if (cpuHasBall && cpuOwner) {
    cpuDribbleAndShoot({ config, match, cpuTeam, owner: cpuOwner, cpuAi });
    return;
  }

  const chaser = pickCpuChaser(match, cpuTeam);
  if (!chaser) return;

  cpuAi.chaserPlayerId = chaser.id;
  cpuChaseBall(match, chaser);
}

function pickCpuChaser(match: MatchState, cpuTeam: Team): Player | null {
  let best: Player | null = null;
  let bestD2 = Infinity;

  for (const p of cpuTeam.players) {
    if (p.role === "GK") continue;
    const d2 = V.distSq(p.pos, match.ball.pos);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }

  return best;
}

function cpuChaseBall(match: MatchState, p: Player) {
  const toBall = V.sub(match.ball.pos, p.pos);
  const dir = V.norm(toBall);
  p.vel.x += dir.x * 0.0001; // tiny bias so facing updates even if blocked by accel logic elsewhere
  p.vel.y += dir.y * 0.0001;

  // Desired velocity is handled in sim step; we stash intent via facing for now.
  p.facingRad = Math.atan2(dir.y, dir.x);

  // Mark this player's "AI intent" on the match (simple approach):
  // We'll derive desiredVel in the sim step for CPU players by comparing facing to ball, so nothing else needed here.
}

function cpuDribbleAndShoot(args: {
  config: EngineConfig;
  match: MatchState;
  cpuTeam: Team;
  owner: Player;
  cpuAi: CpuAiState;
}) {
  const { config, match, cpuTeam, owner, cpuAi } = args;

  // CPU is the away team in this subtask, so it attacks left.
  const targetGoal = getGoalCenter(config, "left");

  // Dribble direction: toward goal with slight sinusoidal Y jitter for variety
  const toGoal = V.sub(targetGoal, owner.pos);
  const baseDir = V.norm(toGoal);
  const jitter = Math.sin(cpuAi.dribbleJitterPhase) * 0.22;

  const dribbleDir: Vec2 = V.norm({ x: baseDir.x, y: baseDir.y + jitter });

  owner.facingRad = Math.atan2(dribbleDir.y, dribbleDir.x);

  const distToGoal = V.len(toGoal);
  const alignedForShot = Math.abs(owner.pos.y) < config.goalHalfW * 1.15;

  // --- Shot decision ---
  const shouldShoot =
    distToGoal < config.pitchW * 0.32 &&
    alignedForShot &&
    cpuAi.shootCooldownMs <= 0;

  if (shouldShoot) {
    cpuAi.shootCooldownMs = 900 + Math.random() * 700;

    releaseBallWithKick({
      match,
      kicker: owner,
      dir: dribbleDir,
      speed: owner.kickPower * 1.18,
    });
    return;
  }

  // --- Pass decision ---
  const underPressure = nearestOpponentDist(match, owner.teamId, owner.pos) < 7.0;

  // If not aligned for a good shot, try a pass to someone who is.
  const wantsPass = cpuAi.shootCooldownMs <= 0 && (underPressure || (!alignedForShot && Math.random() < 0.22) || Math.random() < 0.025);

  if (wantsPass) {
    const passTarget = pickCpuPassTarget({ config, match, cpuTeam, owner, towardGoalDir: baseDir });
    if (passTarget) {
      cpuAi.shootCooldownMs = 650 + Math.random() * 550;

      const to = V.sub(passTarget.pos, owner.pos);
      const dist = V.len(to);
      const dir = V.norm(to);

      const distFactor = clamp01(dist / 46);
      releaseBallWithKick({
        match,
        kicker: owner,
        dir,
        speed: owner.kickPower * (0.78 + 0.42 * distFactor),
      });

      return;
    }
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function nearestOpponentDist(match: MatchState, teamId: string, pos: Vec2): number {
  const oppId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  const opp = match.teamsById[oppId]?.players ?? [];
  let best = Infinity;
  for (const o of opp) {
    const d = V.dist(o.pos, pos);
    if (d < best) best = d;
  }
  return best;
}

function pointSegDistSq(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = V.sub(b, a);
  const ap = V.sub(p, a);
  const abLenSq = V.lenSq(ab);
  if (abLenSq <= 1e-9) return V.lenSq(ap);
  const t = Math.max(0, Math.min(1, V.dot(ap, ab) / abLenSq));
  const closest = V.add(a, V.mul(ab, t));
  return V.distSq(p, closest);
}

/**
 * Pick a reasonably "good" pass target:
 * - ahead toward goal
 * - not immediately covered
 * - lane not obviously blocked
 * - slight preference for players with better shooting alignment (closer to center)
 */
function pickCpuPassTarget(args: {
  config: EngineConfig;
  match: MatchState;
  cpuTeam: Team;
  owner: Player;
  towardGoalDir: Vec2;
}): Player | null {
  const { config, match, cpuTeam, owner, towardGoalDir } = args;

  const oppId = cpuTeam.id === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  const opp = match.teamsById[oppId]?.players ?? [];

  let best: Player | null = null;
  let bestScore = -Infinity;

  for (const t of cpuTeam.players) {
    if (t.role === "GK") continue;
    if (t.id === owner.id) continue;

    const to = V.sub(t.pos, owner.pos);
    const dist = V.len(to);
    if (dist < 8) continue;

    const toN = V.norm(to);

    // "Ahead" means closer to the opponent goal direction.
    const ahead = V.dot(toN, towardGoalDir);
    if (ahead < 0.2) continue;

    // Basic coverage: avoid passing directly into an opponent.
    const cover = nearestOpponentDist(match, cpuTeam.id, t.pos);
    if (cover < 5.2) continue;

    // Lane: avoid obvious interceptions.
    let laneMin = Infinity;
    for (const o of opp) {
      const d = Math.sqrt(pointSegDistSq(o.pos, owner.pos, t.pos));
      if (d < laneMin) laneMin = d;
    }
    const lanePenalty = laneMin < 6.5 ? (6.5 - laneMin) * 1.1 : 0;

    const centerBonus = clamp01(1 - Math.abs(t.pos.y) / (config.goalHalfW * 1.35)) * 0.9;

    const score = ahead * 2.2 + centerBonus - dist * 0.04 - lanePenalty;

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // Require some minimum quality; otherwise keep dribbling.
  if (bestScore < 0.35) return null;

  return best;
}
