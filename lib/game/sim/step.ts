import type { EngineConfig, EngineEvent, EngineState, InputSnapshot, MatchState, Player, Vec2 } from "../engine/engineTypes";
import { clamp, V } from "../math/vec2";
import { resetToKickoff } from "../engine/reset";
import { stepVfx, triggerGoalVfx } from "../vfx/goalVfx";
import {
  attachBallToOwner,
  bounceBallOffPitch,
  containPlayerInPitch,
  integrateFreeBall,
  integratePlayer,
  PLAYER_RADIUS,
  releaseBallWithKick,
  tryClaimBall,
  getAttackDirX,
} from "./physics";
import { stepCpuAi } from "./ai";

const SPRINT_MULT = 1.35;
const SWITCH_COOLDOWN_MS = 250;

// Loose-ball autoswitch hysteresis (prevents flicker between two similarly-close players)
const AUTO_SWITCH_HYSTERESIS = 2.25; // world units

/** Shoot: hold to charge, release to kick. */
const SHOOT_CHARGE_FULL_MS = 650;

/**
 * Unified "action" (Shift / gamepad A):
 * - Offense: hold to build pass charge; release to pass
 * - Defense: press to switch (cooldown-gated)
 */
const ACTION_CHARGE_FULL_MS = 520;
const ACTION_TAP_THRESHOLD_MS = 160;

// Pass assist tuning.
const PASS_MIN_DIST = 6;
const PASS_LANE_BLOCK_DIST = 6.5;

// Ball contact tuning (pickup / steals)
const BALL_PICKUP_PAD = 0.35; // free ball pickup can be generous
const BALL_STEAL_PAD = -0.85; // steals must be extremely tight (nerf defense / easier scoring)
const STEAL_APPROACH_SPEED_MIN = 5.5; // must be clearly moving into the ball to steal

const CPU_DEFENSE_SPEED_MULT = 0.65; // make CPU less oppressive when defending

function getTeamPlayers(match: MatchState, teamId: string): Player[] {
  return match.teamsById[teamId]?.players ?? [];
}

function getOppPlayers(match: MatchState, teamId: string): Player[] {
  const oppId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  return getTeamPlayers(match, oppId);
}

function facingVec(p: Player): Vec2 {
  return { x: Math.cos(p.facingRad), y: Math.sin(p.facingRad) };
}

function pickKickDir(p: Player, moveVec: Vec2): Vec2 {
  // Use move vector when the player is actively steering; otherwise use facing.
  return V.lenSq(moveVec) > 0.04 ? V.norm(moveVec) : V.norm(facingVec(p));
}

function pointSegDistSq(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = V.sub(b, a);
  const ap = V.sub(p, a);
  const abLenSq = V.lenSq(ab);
  if (abLenSq <= 1e-9) return V.lenSq(ap);
  const t = clamp(V.dot(ap, ab) / abLenSq, 0, 1);
  const closest = V.add(a, V.mul(ab, t));
  return V.distSq(p, closest);
}

/**
 * Directional passing (as requested):
 * - Aim direction comes from arrow/WASD movement if held, else facing.
 * - Tap Shift: pass to the NEAREST teammate along the aim direction.
 * - Hold+release Shift: pass to a FARTHER teammate along the aim direction.
 *
 * We measure "along the direction" using projection onto `aimDir` (aheadDist) and
 * require the target to be within a reasonable lateral corridor.
 *
 * Fallback: nearest non-GK teammate.
 */
function pickBestPassTarget(match: MatchState, teamId: string, kicker: Player, aimDir: Vec2, preferFar: boolean): Player | null {
  const teammates = getTeamPlayers(match, teamId);

  // If no aim input, just pick nearest teammate (so pass always selects a player).
  const aim = V.norm(aimDir);
  if (V.lenSq(aim) < 1e-6) {
    let nearest: Player | null = null;
    let bestD2 = Infinity;
    for (const t of teammates) {
      if (t.id === kicker.id) continue;
      const d2 = V.distSq(t.pos, kicker.pos);
      if (d2 < bestD2) {
        bestD2 = d2;
        nearest = t;
      }
    }
    return nearest;
  }

  /**
   * "Nearest to where you pointed" = nearest to the AIM RAY.
   * Use lateral distance to the aim ray (|cross(to, aim)|) as primary selection.
   * - Tap: pick the nearest (smallest lateral, then smallest ahead)
   * - Hold: pick a farther receiver in the same lane (smallest lateral band, then largest ahead)
   */
  type Cand = { p: Player; dist: number; ahead: number; lateral: number };
  const cands: Cand[] = [];

  const minSelectableDist = 3;

  for (const t of teammates) {
    if (t.id === kicker.id) continue; // allow passing to GK too
    const to = V.sub(t.pos, kicker.pos);
    const dist = V.len(to);
    if (dist < minSelectableDist) continue;

    const ahead = V.dot(to, aim);
    const cross = to.x * aim.y - to.y * aim.x;
    const lateral = Math.abs(cross); // since |aim|=1, this is lateral distance to the ray

    cands.push({ p: t, dist, ahead, lateral });
  }

  if (!cands.length) return null;

  // Prefer players in front of the aim direction; if none, allow behind.
  const forward = cands.filter((c) => c.ahead > 1);
  const pool = forward.length ? forward : cands;

  // Find the closest-to-ray candidate.
  let bestLat = Infinity;
  for (const c of pool) bestLat = Math.min(bestLat, c.lateral);

  // Define a "lane band" so hold can pick a farther option in the same lane.
  const laneBand = pool.filter((c) => c.lateral <= bestLat + 2.25);

  if (!preferFar) {
    laneBand.sort((a, b) => (a.lateral - b.lateral) || (a.ahead - b.ahead) || (a.dist - b.dist));
    return laneBand[0]?.p ?? null;
  }

  laneBand.sort((a, b) => (a.lateral - b.lateral) || (b.ahead - a.ahead) || (b.dist - a.dist));
  return laneBand[0]?.p ?? null;
}

/**
 * Player switch heuristic:
 * - always select the non-GK closest to the ball.
 * Includes the currently controlled player (so it can return "no change" if already closest).
 */
function pickBestSwitchCandidate(_config: EngineConfig, match: MatchState, teamId: string, currentId: string): string {
  const ballPos = match.ball.pos;

  let bestId = currentId;
  let bestD2 = Infinity;

  for (const p of getTeamPlayers(match, teamId)) {
    if (p.role === "GK") continue;

    const d2 = V.distSq(p.pos, ballPos);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = p.id;
    }
  }

  return bestId;
}

/**
 * Directional defense switching:
 * - If you are holding a direction, try to switch to the closest-to-ball teammate
 *   that lies roughly in that direction from the BALL.
 * - Otherwise fall back to plain closest-to-ball.
 */
function pickDefensiveSwitchCandidate(match: MatchState, teamId: string, currentId: string, aimDir: Vec2): string {
  const aim = V.norm(aimDir);
  if (V.lenSq(aim) < 1e-6) return pickBestSwitchCandidate({} as EngineConfig, match, teamId, currentId);

  const ballPos = match.ball.pos;

  let bestId = currentId;
  let bestD2 = Infinity;

  for (const p of getTeamPlayers(match, teamId)) {
    if (p.role === "GK") continue;

    const fromBall = V.sub(p.pos, ballPos);
    const fromBallN = V.norm(fromBall);
    const cos = V.dot(fromBallN, aim);

    // must be roughly in that direction (wide)
    if (cos < 0.35) continue;

    const d2 = V.distSq(p.pos, ballPos);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = p.id;
    }
  }

  if (bestId !== currentId) return bestId;

  // fallback: just closest-to-ball
  return pickBestSwitchCandidate({} as EngineConfig, match, teamId, currentId);
}

function resolveScoreSide(match: MatchState, scoringTeamId: string) {
  if (scoringTeamId === match.homeTeamId) match.score.home += 1;
  else if (scoringTeamId === match.awayTeamId) match.score.away += 1;
}

function pushFreeBallByPlayers(match: MatchState, config: EngineConfig, dt: number) {
  const ball = match.ball;
  if (ball.ownerPlayerId) return;

  // If a player runs into the ball, the ball should be pushed, not ignored.
  for (const p of Object.values(match.playersById)) {
    const dx = ball.pos.x - p.pos.x;
    const dy = ball.pos.y - p.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const minDist = PLAYER_RADIUS + ball.radius;
    const overlap = minDist - dist;

    if (overlap <= 0) continue;

    const nx = dist > 1e-6 ? dx / dist : 1;
    const ny = dist > 1e-6 ? dy / dist : 0;

    // Separate ball out of the player.
    ball.pos.x += nx * overlap;
    ball.pos.y += ny * overlap;

    // Impart some velocity based on overlap resolution + player velocity.
    const push = (overlap / Math.max(1e-4, dt)) * 0.08;
    ball.vel.x += nx * push + p.vel.x * 0.35;
    ball.vel.y += ny * push + p.vel.y * 0.35;

    ball.lastTouchTeamId = p.teamId;
  }

  // Keep ball in bounds after being pushed.
  // (Goal mouth behavior handled by integrateFreeBall.)
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  bounceBallOffPitch(config, ball);
}

function setBallOwner(match: MatchState, p: Player) {
  const ball = match.ball;

  ball.ownerPlayerId = p.id;
  ball.lastTouchTeamId = p.teamId;

  for (const x of Object.values(match.playersById)) x.hasBall = false;
  p.hasBall = true;

  match.possession = { teamId: p.teamId, playerId: p.id };
}

/**
 * Immediate pickup when a player physically touches the ball.
 * This makes "getting" the ball feel responsive (no waiting for speed thresholds).
 */
function tryImmediateBallPickup(match: MatchState): Player | null {
  const ball = match.ball;
  if (ball.ownerPlayerId) return null;

  const contactR = PLAYER_RADIUS + ball.radius + BALL_PICKUP_PAD;
  const contactR2 = contactR * contactR;

  let best: Player | null = null;
  let bestD2 = Infinity;

  for (const p of Object.values(match.playersById)) {
    // Prevent the kicker from immediately re-picking up their own pass/shot.
    if (ball.kickNoPickupMs > 0 && ball.lastKickPlayerId && p.id === ball.lastKickPlayerId) continue;

    const d2 = V.distSq(p.pos, ball.pos);
    if (d2 <= contactR2 && d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }

  if (!best) return null;

  setBallOwner(match, best);
  return best;
}

/**
 * Steal/intercept rule:
 * - You can ONLY take the ball from a dribbler if you touch the BALL itself.
 * - If you touch it, you take possession immediately (snappy interceptions).
 */
function tryStealOwnedBallByBallContact(match: MatchState): Player | null {
  const ball = match.ball;
  if (!ball.ownerPlayerId) return null;

  const owner = match.playersById[ball.ownerPlayerId];
  if (!owner) return null;

  const contactR = PLAYER_RADIUS + ball.radius + BALL_STEAL_PAD;
  const contactR2 = contactR * contactR;

  // If any OTHER player overlaps the ball, they win it.
  // (Owner will also be near the ball; exclude them.)
  let best: Player | null = null;
  let bestD2 = Infinity;

  for (const p of Object.values(match.playersById)) {
    if (p.id === owner.id) continue;

    // Prevent the kicker from instantly re-stealing their own kick.
    if (ball.kickNoPickupMs > 0 && ball.lastKickPlayerId && p.id === ball.lastKickPlayerId) continue;

    // Nerf steals: require moving INTO the ball a bit (prevents “magnet steals”).
    const toBall = V.sub(ball.pos, p.pos);
    const toBallN = V.norm(toBall);
    const approach = V.dot(p.vel, toBallN);
    if (approach < STEAL_APPROACH_SPEED_MIN) continue;

    const d2 = V.distSq(p.pos, ball.pos);
    if (d2 <= contactR2 && d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }

  if (!best) return null;

  setBallOwner(match, best);
  return best;
}

function getTeamGoalkeeper(match: MatchState, teamId: string): Player | null {
  return getTeamPlayers(match, teamId).find((p) => p.role === "GK") ?? null;
}

function isDangerousShotTowardGoal(match: MatchState, config: EngineConfig, teamId: string): boolean {
  const ball = match.ball;
  if (ball.ownerPlayerId) return false;

  const halfW = config.pitchW / 2;
  const attackDirX = getAttackDirX(match, teamId);
  const defendDirX = -attackDirX;

  // Is the ball moving meaningfully toward our goal along X?
  const toward = ball.vel.x * defendDirX;
  const speed = V.len(ball.vel);

  if (toward < 9.5) return false; // not really heading goalward
  if (speed < 10.5) return false; // too slow to be a "shot"

  // Only treat as dangerous when it's on our half and within a plausible shooting channel.
  const ownHalf = defendDirX === -1 ? ball.pos.x < 0 : ball.pos.x > 0;
  if (!ownHalf) return false;

  const nearGoal = Math.abs(ball.pos.x) > halfW * 0.18;
  const inChannel = Math.abs(ball.pos.y) < config.goalHalfW * 1.75;

  return nearGoal && inChannel;
}

function roleAnchorY(p: Player): number {
  if (p.role === "GK" || p.role === "MF") return 0;
  const s = p.pos.y >= 0 ? 1 : -1;
  if (p.role === "DF") return s * 12;
  return s * 14; // FW
}

function roleBaseXFrac(role: Player["role"]): number {
  if (role === "GK") return 0.45;
  if (role === "DF") return 0.25;
  if (role === "MF") return 0.15;
  return 0.05; // FW
}

function pickTeamBallChaserId(match: MatchState, teamId: string): string | null {
  let bestId: string | null = null;
  let bestD2 = Infinity;
  for (const p of getTeamPlayers(match, teamId)) {
    if (p.role === "GK") continue;
    const d2 = V.distSq(p.pos, match.ball.pos);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = p.id;
    }
  }
  return bestId;
}

function computeNpcDesiredVel(args: {
  match: MatchState;
  config: EngineConfig;
  p: Player;
  teamId: string;
  teamHasPossession: boolean;
  isBallOwner: boolean;
  isChaser: boolean;
}): Vec2 {
  const { match, config, p, teamId, teamHasPossession, isBallOwner, isChaser } = args;

  const halfW = config.pitchW / 2;
  const halfH = config.pitchH / 2;

  const attackDirX = getAttackDirX(match, teamId);
  const ownGoalX = attackDirX === 1 ? -halfW : halfW;
  const oppGoalX = -ownGoalX;

  const anchorX = -attackDirX * config.pitchW * roleBaseXFrac(p.role);
  const anchorY = roleAnchorY(p);

  const ballPos = match.ball.pos;

  let target: Vec2;

  if (p.role === "GK") {
    const x = ownGoalX + attackDirX * 4.0; // stay in front of goal line
    const farFromGoal = Math.abs(ballPos.x - ownGoalX) > config.pitchW * 0.35;

    const yTrack = clamp(ballPos.y, -config.goalHalfW * 0.9, config.goalHalfW * 0.9);
    const y = farFromGoal ? yTrack * 0.25 : yTrack;

    target = { x, y };
  } else if (isChaser && !teamHasPossession) {
    // Closest (non-GK) player should actively close down a free ball / opponent dribble.
    target = { x: ballPos.x, y: ballPos.y };
  } else if (teamHasPossession) {
    if (isBallOwner) {
      // Dribble toward opponent goal.
      target = { x: oppGoalX - attackDirX * 6, y: clamp(ballPos.y * 0.15, -config.goalHalfW * 1.1, config.goalHalfW * 1.1) };
    } else {
      const advance = p.role === "FW" ? 22 : p.role === "MF" ? 14 : 7; // DF trails
      let x = ballPos.x + attackDirX * advance;

      // DF should not get ahead of the ball.
      if (p.role === "DF") {
        x = attackDirX === 1 ? Math.min(x, ballPos.x - 4) : Math.max(x, ballPos.x + 4);
      }

      // Soft team shape: tend toward lane + a bit of ball-follow.
      const y = clamp(anchorY * 0.75 + ballPos.y * 0.25, -halfH + 4, halfH - 4);

      target = { x, y };
    }
  } else {
    // Defending: stay goal-side of the ball and track its y a bit.
    const back = p.role === "DF" ? 16 : p.role === "MF" ? 12 : 8;
    let x = ballPos.x - attackDirX * back;

    // Ensure we're between ball and our own goal.
    x = attackDirX === 1 ? Math.min(x, ballPos.x - 1) : Math.max(x, ballPos.x + 1);

    // DF should not roam past midfield much.
    if (p.role === "DF") {
      x = attackDirX === 1 ? Math.min(x, 2) : Math.max(x, -2);
    }

    // Return toward anchor when ball is far away (reduces chasing chaos).
    const ballFar = V.distSq(p.pos, ballPos) > 28 * 28;
    const yFollow = clamp(ballPos.y, -halfH + 4, halfH - 4);
    const y = ballFar ? clamp(anchorY * 0.9 + yFollow * 0.1, -halfH + 4, halfH - 4) : clamp(anchorY * 0.65 + yFollow * 0.35, -halfH + 4, halfH - 4);

    target = { x, y };
  }

  // Leash to anchors so players don't wander into absurd positions.
  const leashX = p.role === "GK" ? 6 : p.role === "DF" ? 18 : p.role === "MF" ? 28 : 36;
  const leashY = p.role === "GK" ? 10 : p.role === "DF" ? 16 : p.role === "MF" ? 22 : 26;

  target.x = clamp(target.x, anchorX - leashX, anchorX + leashX);
  target.y = clamp(target.y, anchorY - leashY, anchorY + leashY);

  // Clamp to pitch.
  target.x = clamp(target.x, -halfW + 4, halfW - 4);
  target.y = clamp(target.y, -halfH + 4, halfH - 4);

  const to = V.sub(target, p.pos);
  const d = V.len(to);

  if (d < 0.75) return { x: 0, y: 0 };

  const baseSpeedMult = p.role === "GK" ? 0.62 : p.role === "DF" ? 0.78 : p.role === "MF" ? 0.86 : 0.9;
  const speed = p.maxSpeed * baseSpeedMult;

  return V.mul(V.norm(to), speed);
}

export function stepSim(args: {
  engine: EngineState;
  input: InputSnapshot;
  dtMs: number;
}): EngineEvent[] {
  const { engine, input, dtMs } = args;
  const config = engine.config;
  const match = engine.match;

  const events: EngineEvent[] = [];
  const dt = dtMs / 1000;

  if (match.clock.phase === "FULL_TIME") return events;

  // --- Kickoff pause (post-goal) ---
  // Freeze gameplay after a goal:
  // 1) brief hold for celebration
  // 2) then wait for "any input" to resume
  const anyInput =
    V.lenSq(input.moveVec) > 0.01 ||
    input.sprint ||
    input.actionDown ||
    input.actionPressed ||
    input.actionReleased ||
    input.shootDown ||
    input.shootReleased ||
    input.pausePressed;

  // Celebration + VFX timers still tick during kickoff pauses.
  engine.celebrationMs = Math.max(0, engine.celebrationMs - dtMs);
  stepVfx(engine, dtMs);

  if (engine.kickoffHoldMs > 0) {
    engine.kickoffHoldMs = Math.max(0, engine.kickoffHoldMs - dtMs);
    if (engine.kickoffHoldMs <= 0) {
      engine.kickoffAwaitInput = true;
    }
    return events;
  }

  if (engine.kickoffAwaitInput) {
    if (anyInput) {
      engine.kickoffAwaitInput = false;
      match.lastEventText = null;
    }
    return events;
  }

  // --- Clock ---
  match.clock.msElapsed = Math.min(match.clock.msTotal, match.clock.msElapsed + dtMs);
  if (match.clock.msElapsed >= match.clock.msTotal) {
    match.clock.phase = "FULL_TIME";
    match.lastEventText = "FULL TIME";
    events.push({ type: "FULL_TIME", score: { ...match.score }, text: "FULL TIME" });
    return events;
  }

  // Switch cooldown
  engine.switchCooldownMs = Math.max(0, engine.switchCooldownMs - dtMs);

  // Steal cooldown (prevents rapid back-and-forth "ping-pong" interceptions)
  engine.stealCooldownMs = Math.max(0, engine.stealCooldownMs - dtMs);

  const cpuTeamId = match.awayTeamId;
  const humanTeamId = match.humanTeamId;

  // Remember previous ownership to detect interceptions / GK pickups for auto-switch.
  const prevOwnerId = match.ball.ownerPlayerId;
  const prevOwner = prevOwnerId ? match.playersById[prevOwnerId] : null;
  const prevOwnerTeamId = prevOwner?.teamId ?? null;

  const possessionTeamId = match.possession.teamId ?? match.ball.lastTouchTeamId;

  // Offense rule: only ever control the player who has the ball (auto-switch to ball carrier).
  const ownerIdPre = match.ball.ownerPlayerId;
  const ownerPre = ownerIdPre ? match.playersById[ownerIdPre] : null;
  if (ownerPre && ownerPre.teamId === humanTeamId && match.controlledPlayerId !== ownerPre.id) {
    match.controlledPlayerId = ownerPre.id;
    engine.actionChargeMs = 0;
    engine.switchCooldownMs = 120;
  }

  const controlled = match.playersById[match.controlledPlayerId];
  const controlledHasBall = !!controlled && match.ball.ownerPlayerId === controlled.id;

  // --- Auto-switch on loose ball: control closest-to-ball (with hysteresis to prevent flicker) ---
  if (!match.ball.ownerPlayerId && engine.switchCooldownMs <= 0) {
    const gk = getTeamGoalkeeper(match, humanTeamId);
    const shotIncoming = isDangerousShotTowardGoal(match, config, humanTeamId);

    if (shotIncoming && gk) {
      if (match.controlledPlayerId !== gk.id) {
        match.controlledPlayerId = gk.id;
        engine.switchCooldownMs = 180;
        engine.actionChargeMs = 0;
      }
    } else {
      const nextId = pickBestSwitchCandidate(config, match, humanTeamId, match.controlledPlayerId);

      const cur = match.playersById[match.controlledPlayerId];
      const nxt = match.playersById[nextId];

      const curD2 = cur ? V.distSq(cur.pos, match.ball.pos) : Infinity;
      const nxtD2 = nxt ? V.distSq(nxt.pos, match.ball.pos) : Infinity;

      // Only switch if the candidate is meaningfully closer than current (prevents oscillation).
      if (nextId !== match.controlledPlayerId && nxtD2 + AUTO_SWITCH_HYSTERESIS * AUTO_SWITCH_HYSTERESIS < curD2) {
        match.controlledPlayerId = nextId;
        engine.switchCooldownMs = 180;
        engine.actionChargeMs = 0;
      }
    }
  }

  // --- Human switching (defense only: when controlled player does NOT have the ball) ---
  if (input.actionPressed && !controlledHasBall && engine.switchCooldownMs <= 0) {
    // If player is holding a direction, use it to pick WHICH nearby-to-ball teammate to switch to.
    // Otherwise default is closest-to-ball.
    const nextId = pickDefensiveSwitchCandidate(match, humanTeamId, match.controlledPlayerId, input.moveVec);
    match.controlledPlayerId = nextId;
    engine.switchCooldownMs = SWITCH_COOLDOWN_MS;
    engine.actionChargeMs = 0;
  }

  // --- CPU AI ---
  stepCpuAi({
    config,
    match,
    dtMs,
    cpuAi: engine.cpuAi,
  });

  // --- Determine desired velocities ---

  // Human: controlled player uses input.
  const humanDir = V.norm(input.moveVec);
  if (controlled && controlled.teamId === humanTeamId) {
    const speed = controlled.maxSpeed * (input.sprint ? SPRINT_MULT : 1);
    const desired = V.mul(humanDir, speed);
    integratePlayer(controlled, desired, dt);
    containPlayerInPitch(config, controlled);
  }

  const ownerId = match.ball.ownerPlayerId;
  const owner = ownerId ? match.playersById[ownerId] : null;

  const humanChaserId = pickTeamBallChaserId(match, humanTeamId);
  const cpuChaserId = pickTeamBallChaserId(match, cpuTeamId);

  // Human NPCs (non-controlled) move independently.
  const humanHasPossession = possessionTeamId === humanTeamId;
  for (const p of getTeamPlayers(match, humanTeamId)) {
    if (p.id === match.controlledPlayerId) continue;

    const desired = computeNpcDesiredVel({
      match,
      config,
      p,
      teamId: humanTeamId,
      teamHasPossession: humanHasPossession,
      isBallOwner: owner?.id === p.id,
      isChaser: !humanHasPossession && p.id === humanChaserId,
    });

    integratePlayer(p, desired, dt);
    containPlayerInPitch(config, p);
  }

  // CPU team: all NPCs move independently.
  const cpuHasPossession = possessionTeamId === cpuTeamId;
  for (const p of getTeamPlayers(match, cpuTeamId)) {
    let desired = computeNpcDesiredVel({
      match,
      config,
      p,
      teamId: cpuTeamId,
      teamHasPossession: cpuHasPossession,
      isBallOwner: owner?.id === p.id,
      isChaser: !cpuHasPossession && p.id === cpuChaserId,
    });

    // Nerf CPU defense pressure (easier scoring)
    if (!cpuHasPossession) desired = V.mul(desired, CPU_DEFENSE_SPEED_MULT);

    integratePlayer(p, desired, dt);
    containPlayerInPitch(config, p);
  }

  // --- Ball: possession + movement ---
  const ball = match.ball;

  // Post-kick pickup protection countdown
  ball.kickNoPickupMs = Math.max(0, ball.kickNoPickupMs - dtMs);

  // If ball is owned, attach it; else integrate.
  if (ball.ownerPlayerId) {
    const owner = match.playersById[ball.ownerPlayerId];
    if (owner) {
      // Steal/intercept ONLY by contacting the BALL itself.
      // Guarded by a short cooldown to prevent jittery back-and-forth steals.
      const stolenBy = engine.stealCooldownMs <= 0 ? tryStealOwnedBallByBallContact(match) : null;
      if (stolenBy) {
        engine.shootChargeMs = 0;
        engine.actionChargeMs = 0;
        engine.stealCooldownMs = 650;
      }

      const currentOwnerId = match.ball.ownerPlayerId;
      const currentOwner = currentOwnerId ? match.playersById[currentOwnerId] : null;

      // If our GK gains possession, auto-switch to them immediately (so you can pass).
      if (currentOwner?.teamId === humanTeamId && currentOwner.role === "GK" && match.controlledPlayerId !== currentOwner.id) {
        match.controlledPlayerId = currentOwner.id;
        engine.switchCooldownMs = 180;
        engine.actionChargeMs = 0;
      }

      // Kick actions (human only when the BALL OWNER is the controlled player)
      const isHumanControlledOwner = !!currentOwner && currentOwner.teamId === humanTeamId && currentOwner.id === match.controlledPlayerId;
      if (isHumanControlledOwner) {
        const aimDir = pickKickDir(currentOwner, input.moveVec);

        // Shoot charge: holding builds charge; release converts charge into a kick.
        if (input.shootDown) {
          engine.shootChargeMs = Math.min(SHOOT_CHARGE_FULL_MS, engine.shootChargeMs + dtMs);
        } else if (!input.shootReleased) {
          // Not holding, not releasing => clear any partial charge.
          engine.shootChargeMs = 0;
        }

        // Action(pass) charge: holding builds charge; release triggers pass.
        if (input.actionDown) {
          engine.actionChargeMs = Math.min(ACTION_CHARGE_FULL_MS, engine.actionChargeMs + dtMs);
        } else if (!input.actionReleased) {
          engine.actionChargeMs = 0;
        }

        // Passing happens on release (tap vs hold is determined by charge duration)
        if (input.actionReleased) {
          const preferFar = engine.actionChargeMs > ACTION_TAP_THRESHOLD_MS;

          // Aimed pass: pick teammate based on aim; tap chooses near, hold chooses farther.
          const target = pickBestPassTarget(match, humanTeamId, currentOwner, aimDir, preferFar);
          // Always direct to the selected teammate (fallback handled inside pickBestPassTarget).
          const dir = target ? V.norm(V.sub(target.pos, currentOwner.pos)) : V.norm(aimDir);

          const dist = target ? V.len(V.sub(target.pos, currentOwner.pos)) : 18;
          const distFactor = clamp(dist / 46, 0, 1);

          const t = clamp(engine.actionChargeMs / ACTION_CHARGE_FULL_MS, 0, 1);
          const chargeFactor = preferFar ? t : 0.25;

          releaseBallWithKick({
            match,
            kicker: currentOwner,
            dir,
            speed: currentOwner.kickPower * (0.78 + 0.62 * chargeFactor) * (0.86 + 0.22 * distFactor),
          });

          engine.actionChargeMs = 0;
          engine.shootChargeMs = 0;
        } else if (input.shootReleased) {
          const t = clamp(engine.shootChargeMs / SHOOT_CHARGE_FULL_MS, 0, 1);

          releaseBallWithKick({
            match,
            kicker: currentOwner,
            dir: aimDir,
            speed: currentOwner.kickPower * (1.05 + 0.75 * t),
          });

          engine.shootChargeMs = 0;
          engine.actionChargeMs = 0;
        }
      } else {
        // Not controlled => ensure human charges don't "stick" if you switched away mid-hold.
        engine.actionChargeMs = 0;
      }

      if (ball.ownerPlayerId && currentOwner) {
        attachBallToOwner(ball, currentOwner);
      }
    } else {
      ball.ownerPlayerId = null;
    }
  }

  // Free ball physics
  if (!ball.ownerPlayerId) {
    const goal = integrateFreeBall(match, config, ball, dt);
    if (goal.scored && goal.scoringTeamId) {
      resolveScoreSide(match, goal.scoringTeamId);
      match.lastEventText = "GOAL!";
      engine.celebrationMs = 1400;

      // After a goal: brief pause, then "any key" to kickoff.
      engine.kickoffHoldMs = 650;
      engine.kickoffAwaitInput = false;

      // Goal celebration VFX (confetti + banner + crowd pulse).
      // This triggers exactly once per goal because this branch returns immediately.
      triggerGoalVfx(engine, goal.scoringTeamId);

      events.push({
        type: "GOAL",
        scoringTeamId: goal.scoringTeamId,
        score: { ...match.score },
        text: "GOAL!",
      });

      resetToKickoff(config, match);
      return events;
    }

    // Player-ball bumping (so running into the ball moves it)
    pushFreeBallByPlayers(match, config, dt);

    // Immediate pickup if someone touches the ball this tick.
    tryImmediateBallPickup(match);

    // Possession claim fallback (after physics + bumps)
    if (!ball.ownerPlayerId) {
      match.possession = tryClaimBall(match);
      if (match.possession.playerId) {
        ball.ownerPlayerId = match.possession.playerId;
      }
    }
  } else {
    // Maintain possession info while owned
    const owner = match.playersById[ball.ownerPlayerId];
    if (owner) match.possession = { teamId: owner.teamId, playerId: owner.id };
  }

  // --- Auto-switch when human team gains possession (intercept / tackle-by-ball-contact) ---
  if (match.ball.ownerPlayerId) {
    const newOwner = match.playersById[match.ball.ownerPlayerId];
    const gained = !!newOwner && newOwner.teamId === humanTeamId && prevOwnerTeamId !== humanTeamId;

    if (gained && match.controlledPlayerId !== newOwner.id) {
      match.controlledPlayerId = newOwner.id;
      engine.switchCooldownMs = 220;
      engine.actionChargeMs = 0;
    }
  }

  return events;
}