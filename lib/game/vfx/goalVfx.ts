import type { EngineConfig, EngineState } from "../engine/engineTypes";
import { clamp } from "../math/vec2";

export const GOAL_VFX_DURATION_MS = 2600;
export const GOAL_BANNER_MS = 1250;
export const GOAL_CROWD_PULSE_MS = 650;

const CONFETTI_CAP = 150;
const CONFETTI_BURST = 110;
const CONFETTI_TRICKLE_MS = 700; // keep emitting briefly after the goal
const CONFETTI_TRICKLE_PER_STEP = 3;

const GRAVITY = 26; // world units / s^2
const DRAG = 0.985;

export type ConfettiParticle = {
  active: 0 | 1;

  // world-space (pitch-centered) coords
  x: number;
  y: number;

  vx: number;
  vy: number;

  rot: number;
  vr: number;

  size: number; // world-units
  colorIdx: number; // palette index (avoid per-frame string building)
  lifeMs: number;
  ageMs: number;
};

export type GoalVfxState = {
  // remaining timers
  activeMs: number;
  bannerMs: number;
  crowdPulseMs: number;

  scoringTeamId: string | null;

  // confetti pool (fixed size)
  particles: ConfettiParticle[];
  nextIdx: number;

  // deterministic RNG for stable-ish visuals without allocations
  rng: number;

  // bookkeeping for trickle emission window
  elapsedMs: number;
};

export type VfxState = {
  goal: GoalVfxState;
};

export function createVfxState(): VfxState {
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < CONFETTI_CAP; i++) {
    particles.push({
      active: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vr: 0,
      size: 1,
      colorIdx: 0,
      lifeMs: 0,
      ageMs: 0,
    });
  }

  return {
    goal: {
      activeMs: 0,
      bannerMs: 0,
      crowdPulseMs: 0,
      scoringTeamId: null,
      particles,
      nextIdx: 0,
      rng: 0x12345678,
      elapsedMs: 0,
    },
  };
}

export function triggerGoalVfx(engine: EngineState, scoringTeamId: string) {
  const g = engine.vfx.goal;

  g.activeMs = GOAL_VFX_DURATION_MS;
  g.bannerMs = GOAL_BANNER_MS;
  g.crowdPulseMs = GOAL_CROWD_PULSE_MS;
  g.scoringTeamId = scoringTeamId;
  g.elapsedMs = 0;

  // Mix the scoring team id into the RNG so bursts vary a bit per match/team.
  g.rng = mixSeed(g.rng, scoringTeamId);

  // Burst fill: overwrite the pool from a moving cursor to avoid full clears.
  for (let i = 0; i < CONFETTI_BURST; i++) {
    spawnConfetti(engine.config, g);
  }
}

export function stepVfx(engine: EngineState, dtMs: number) {
  const g = engine.vfx.goal;

  if (g.activeMs > 0) {
    g.activeMs = Math.max(0, g.activeMs - dtMs);
    g.elapsedMs += dtMs;
  }

  g.bannerMs = Math.max(0, g.bannerMs - dtMs);
  g.crowdPulseMs = Math.max(0, g.crowdPulseMs - dtMs);

  // Trickle emission for the first ~0.7s.
  if (g.activeMs > 0 && g.elapsedMs < CONFETTI_TRICKLE_MS) {
    // emit rate locked to sim tick, not wall time; simple + stable
    for (let i = 0; i < CONFETTI_TRICKLE_PER_STEP; i++) {
      spawnConfetti(engine.config, g);
    }
  }

  // Step particles (even if activeMs reached 0, let existing particles finish naturally)
  const dt = dtMs / 1000;
  for (let i = 0; i < g.particles.length; i++) {
    const p = g.particles[i];
    if (!p.active) continue;

    p.ageMs += dtMs;
    if (p.ageMs >= p.lifeMs) {
      p.active = 0;
      continue;
    }

    // gravity + light sideways flutter
    p.vy += GRAVITY * dt;
    p.vx += (rand01(g) - 0.5) * 2.1 * dt;

    p.vx *= DRAG;
    p.vy *= DRAG;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.rot += p.vr * dt;
  }
}

export function anyActiveGoalVfx(engine: EngineState): boolean {
  const g = engine.vfx.goal;
  if (g.activeMs > 0 || g.bannerMs > 0 || g.crowdPulseMs > 0) return true;

  for (let i = 0; i < g.particles.length; i++) {
    if (g.particles[i].active) return true;
  }
  return false;
}

export function confettiAlpha(p: ConfettiParticle): number {
  if (!p.active) return 0;

  const t = clamp(p.ageMs / Math.max(1, p.lifeMs), 0, 1);
  // Fade out hard in the last ~25%.
  const tail = clamp((t - 0.75) / 0.25, 0, 1);
  return 1 - tail;
}

function spawnConfetti(config: EngineConfig, g: GoalVfxState) {
  const p = g.particles[g.nextIdx];
  g.nextIdx = (g.nextIdx + 1) % g.particles.length;

  p.active = 1;
  p.ageMs = 0;

  // Stagger lifespan so it naturally thins out.
  p.lifeMs = 1600 + rand01(g) * 950;

  // Spawn across the pitch, starting a little above the top boundary so it "falls in".
  const x = (rand01(g) - 0.5) * config.pitchW;
  const y = -config.pitchH * 0.5 - 6 - rand01(g) * 12;

  p.x = x;
  p.y = y;

  p.vx = (rand01(g) - 0.5) * 16;
  p.vy = 10 + rand01(g) * 16;

  p.rot = rand01(g) * Math.PI * 2;
  p.vr = (rand01(g) - 0.5) * 12;

  // world size roughly "pixel-ish" at typical scales
  p.size = 0.7 + rand01(g) * 1.6;

  // A bright palette via fixed indices (strings are kept in the renderer).
  p.colorIdx = (g.nextIdx + Math.floor(rand01(g) * 1000)) % 6;
}

function mixSeed(seed: number, s: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function rand01(g: { rng: number }): number {
  // xorshift32
  let x = g.rng >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.rng = x >>> 0;
  return (g.rng >>> 0) / 0xffffffff;
}