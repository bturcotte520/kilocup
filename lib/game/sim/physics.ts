import type { Ball, EngineConfig, MatchState, Player, Possession, Vec2 } from "../engine/engineTypes";
import { clamp, V } from "../math/vec2";

export const PLAYER_RADIUS = 2.0;
export const PLAYER_MASS = 1; // unused (placeholder)
export const BALL_FRICTION_PER_SEC = 0.82; // velocity multiplier per second (approx)
export const BALL_RESTITUTION = 0.55;

export const BALL_CLAIM_SPEED_MAX = 7.5;
export const BALL_CLAIM_DIST = PLAYER_RADIUS + 1.2 + 0.9; // playerR + ballR(default) + buffer

export const BALL_RELEASE_KICK_SPEED_MIN = 8;

export type GoalResult = { scored: boolean; scoringTeamId: string | null };

export function integratePlayer(p: Player, desiredVel: Vec2, dt: number) {
  // Smoothly accelerate toward desired velocity (arcade style)
  const dv = V.sub(desiredVel, p.vel);
  const maxDv = p.accel * dt;
  const dvClamped = V.clampLen(dv, maxDv);

  p.vel.x += dvClamped.x;
  p.vel.y += dvClamped.y;

  // Cap speed
  const vLen = V.len(p.vel);

  // IMPORTANT:
  // `desiredVel` may exceed `p.maxSpeed` (eg sprint). If we cap to `p.maxSpeed` unconditionally,
  // sprint can never actually make you faster. So we cap to the larger of:
  // - base player max, and
  // - the desired speed this tick.
  const desiredSpeed = V.len(desiredVel);
  const speedCap = Math.max(p.maxSpeed, desiredSpeed);

  if (vLen > speedCap) {
    const s = speedCap / vLen;
    p.vel.x *= s;
    p.vel.y *= s;
  }

  // Move
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;

  // Facing
  if (vLen > 0.2) {
    p.facingRad = Math.atan2(p.vel.y, p.vel.x);
  }
}

export function containPlayerInPitch(config: EngineConfig, p: Player) {
  const halfW = config.pitchW / 2;
  const halfH = config.pitchH / 2;

  p.pos.x = clamp(p.pos.x, -halfW + PLAYER_RADIUS, halfW - PLAYER_RADIUS);
  p.pos.y = clamp(p.pos.y, -halfH + PLAYER_RADIUS, halfH - PLAYER_RADIUS);
}

export function integrateFreeBall(match: MatchState, config: EngineConfig, ball: Ball, dt: number): GoalResult {
  // Integrate
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;

  // Apply friction (exponential-ish)
  const f = Math.pow(BALL_FRICTION_PER_SEC, dt);
  ball.vel.x *= f;
  ball.vel.y *= f;

  // Clamp tiny velocities to zero (avoid micro jitter)
  if (Math.abs(ball.vel.x) < 0.05) ball.vel.x = 0;
  if (Math.abs(ball.vel.y) < 0.05) ball.vel.y = 0;

  // Goal detection happens when ball crosses goal line beyond pitch bounds
  const goal = detectGoal(match, config, ball);
  if (goal.scored) return goal;

  // Containment / bounce off pitch edges (unless in goal mouth area)
  bounceBallOffPitch(config, ball);

  return { scored: false, scoringTeamId: null };
}

export function attachBallToOwner(ball: Ball, owner: Player) {
  // Ball sits slightly in front of the player's facing direction
  const front = { x: Math.cos(owner.facingRad), y: Math.sin(owner.facingRad) };
  const offset = PLAYER_RADIUS + ball.radius * 0.85;

  ball.pos.x = owner.pos.x + front.x * offset;
  ball.pos.y = owner.pos.y + front.y * offset;

  // Follow owner's velocity (dribble)
  ball.vel.x = owner.vel.x;
  ball.vel.y = owner.vel.y;
}

/**
 * Goal semantics:
 * - Home team (Kilo) starts on the left and attacks right.
 * - Away team (CPU) starts on the right and attacks left.
 * Therefore:
 * - Ball crossing LEFT goal line => away scores
 * - Ball crossing RIGHT goal line => home scores
 */
export function detectGoal(match: MatchState, config: EngineConfig, ball: Ball): GoalResult {
  const halfW = config.pitchW / 2;

  const inMouth = Math.abs(ball.pos.y) <= config.goalHalfW;
  if (!inMouth) return { scored: false, scoringTeamId: null };

  if (ball.pos.x <= -halfW - ball.radius) {
    return { scored: true, scoringTeamId: match.awayTeamId };
  }
  if (ball.pos.x >= halfW + ball.radius) {
    return { scored: true, scoringTeamId: match.homeTeamId };
  }

  return { scored: false, scoringTeamId: null };
}

export function bounceBallOffPitch(config: EngineConfig, ball: Ball) {
  const halfW = config.pitchW / 2;
  const halfH = config.pitchH / 2;

  const inMouthBand = Math.abs(ball.pos.y) <= config.goalHalfW;

  // Left / right walls: if in mouth band, allow ball to pass into goal area (no bounce)
  if (!inMouthBand) {
    if (ball.pos.x < -halfW + ball.radius) {
      ball.pos.x = -halfW + ball.radius;
      ball.vel.x = Math.abs(ball.vel.x) * BALL_RESTITUTION;
    } else if (ball.pos.x > halfW - ball.radius) {
      ball.pos.x = halfW - ball.radius;
      ball.vel.x = -Math.abs(ball.vel.x) * BALL_RESTITUTION;
    }
  }

  // Top / bottom walls always bounce
  if (ball.pos.y < -halfH + ball.radius) {
    ball.pos.y = -halfH + ball.radius;
    ball.vel.y = Math.abs(ball.vel.y) * BALL_RESTITUTION;
  } else if (ball.pos.y > halfH - ball.radius) {
    ball.pos.y = halfH - ball.radius;
    ball.vel.y = -Math.abs(ball.vel.y) * BALL_RESTITUTION;
  }
}

export function tryClaimBall(match: MatchState): Possession {
  const ball = match.ball;

  if (ball.ownerPlayerId) {
    // Owned ball => possession already set upstream
    return match.possession;
  }

  const speed = V.len(ball.vel);
  if (speed > BALL_CLAIM_SPEED_MAX) return { teamId: null, playerId: null };

  let bestP: Player | null = null;
  let bestD2 = Infinity;

  for (const p of Object.values(match.playersById)) {
    // Prevent the kicker from instantly re-claiming their own pass/shot.
    if (ball.kickNoPickupMs > 0 && ball.lastKickPlayerId && p.id === ball.lastKickPlayerId) continue;

    const d2 = V.distSq(p.pos, ball.pos);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestP = p;
    }
  }

  if (!bestP) return { teamId: null, playerId: null };

  const canClaim = bestD2 <= BALL_CLAIM_DIST * BALL_CLAIM_DIST;
  if (!canClaim) return { teamId: null, playerId: null };

  // Claim!
  ball.ownerPlayerId = bestP.id;
  ball.lastTouchTeamId = bestP.teamId;

  // Once claimed, clear kick protection.
  ball.lastKickPlayerId = null;
  ball.kickNoPickupMs = 0;

  for (const p of Object.values(match.playersById)) p.hasBall = false;
  bestP.hasBall = true;

  return { teamId: bestP.teamId, playerId: bestP.id };
}

export function releaseBallWithKick(args: {
  match: MatchState;
  kicker: Player;
  dir: Vec2;
  speed: number;
}) {
  const { match, kicker } = args;
  const ball = match.ball;

  const dirN = V.norm(args.dir);
  const kickSpeed = Math.max(args.speed, BALL_RELEASE_KICK_SPEED_MIN);

  ball.ownerPlayerId = null;
  ball.lastTouchTeamId = kicker.teamId;

  // Kick QoL: don't let the kicker instantly re-claim the ball on the next tick.
  ball.lastKickPlayerId = kicker.id;
  ball.kickNoPickupMs = 220;

  kicker.hasBall = false;

  ball.vel.x = dirN.x * kickSpeed + kicker.vel.x * 0.35;
  ball.vel.y = dirN.y * kickSpeed + kicker.vel.y * 0.35;
}

export function getGoalCenter(config: EngineConfig, goalSide: "left" | "right") {
  const halfW = config.pitchW / 2;
  return { x: goalSide === "left" ? -halfW : halfW, y: 0 };
}

/**
 * Attack direction convention for this subtask:
 * - Home attacks +X (to the right)
 * - Away attacks -X (to the left)
 */
export function getAttackDirX(match: MatchState, teamId: string): 1 | -1 {
  return teamId === match.homeTeamId ? 1 : -1;
}