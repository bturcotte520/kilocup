import type { VfxState } from "../vfx/goalVfx";

export type Vec2 = { x: number; y: number };

export type PlayerRole = "GK" | "DF" | "MF" | "FW";

export type Player = {
  id: string;
  name: string;
  role: PlayerRole;
  teamId: string;

  pos: Vec2;
  vel: Vec2;
  facingRad: number;

  stamina: number; // 0..1
  hasBall: boolean;

  // gameplay tuning
  maxSpeed: number;
  accel: number;
  kickPower: number;
};

export type Team = {
  id: string;
  code3: string; // eg BRA
  name: string; // eg Brazil
  flag: string; // emoji
  kit: {
    primary: string; // hex color for fill
    secondary: string; // hex color for outline
  };
  players: Player[];
  controlledBy: "human" | "cpu";
};

export type Ball = {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  ownerPlayerId: string | null; // null means free ball
  lastTouchTeamId: string | null;

  // Kick/passing QoL: prevent the kicker from immediately re-claiming the ball on the next tick.
  lastKickPlayerId: string | null;
  kickNoPickupMs: number; // countdown in milliseconds
};

export type MatchClock = {
  msElapsed: number;
  msTotal: number; // 6 minutes accelerated in-game time
  phase: "PRE_KICKOFF" | "FIRST_HALF" | "HALF_TIME" | "SECOND_HALF" | "FULL_TIME";
};

export type Score = { home: number; away: number };

export type Possession = {
  teamId: string | null;
  playerId: string | null;
};

export type MatchState = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;

  score: Score;
  clock: MatchClock;

  ball: Ball;

  // indices for quick lookup
  playersById: Record<string, Player>;
  teamsById: Record<string, Team>;

  // human control
  humanTeamId: string; // Kilo team
  controlledPlayerId: string; // currently selected player

  possession: Possession;
  lastEventText: string | null; // eg GOAL
};

/**
 * Host-input snapshot for a single sim step.
 *
 * Notes:
 * - `*Pressed` / `*Released` flags are EDGE-triggered and should be true for one sim step.
 * - `*Down` flags are hold flags.
 * - `action*` is the context button:
 *   - On defense: press => switch to closest-to-ball teammate
 *   - On offense: hold + release => pass (tap = short/near, hold = longer/farther)
 * - `shootDown` is a hold flag used for charge accumulation; `shootReleased` triggers the kick.
 */
export type InputSnapshot = {
  moveVec: Vec2; // normalized desired movement direction (x,y in [-1..1])

  sprint: boolean; // separate from action (keyboard default: "J", gamepad: LB)

  actionDown: boolean; // hold
  actionPressed: boolean; // edge-trigger (down)
  actionReleased: boolean; // edge-trigger (up)

  shootDown: boolean; // hold
  shootReleased: boolean; // edge-trigger (released after being down)

  pausePressed: boolean; // edge-trigger (toggle pause)
};

export type EngineConfig = {
  pitchW: number;
  pitchH: number;

  goalHalfW: number; // half-width of mouth along Y axis
  goalDepth: number;

  simDtMs: number;
  maxFrameDtMs: number;

  uiHz: number;

  matchMsTotal: number;
};

export type EngineEvent =
  | {
      type: "GOAL";
      scoringTeamId: string;
      score: Score;
      text: string;
    }
  | {
      type: "FULL_TIME";
      score: Score;
      text: string;
    };

export type EngineViewModel = {
  home: { name: string; code3: string; flag: string; kit: { primary: string; secondary: string } };
  away: { name: string; code3: string; flag: string; kit: { primary: string; secondary: string } };

  score: Score;
  msRemaining: number;
  phase: MatchClock["phase"];

  paused: boolean;

  lastEventText: string | null;

  // set true briefly after a goal; later tasks can swap into VFX layers
  celebrationActive: boolean;

  // lightweight HUD extras (computed at UI sampling cadence)
  controlledPlayerName: string;
  possession: { teamId: string | null; playerName: string | null };
};

export type CpuAiState = {
  shootCooldownMs: number;
  dribbleJitterPhase: number;

  // set each step by AI; sim uses it to decide which CPU player is actively moving
  chaserPlayerId: string | null;
};

export type EngineState = {
  config: EngineConfig;
  match: MatchState;

  vfx: VfxState;

  paused: boolean;

  // Kickoff pause after a goal:
  // - hold briefly for celebration
  // - then wait for "any key" to resume play
  kickoffHoldMs: number;
  kickoffAwaitInput: boolean;

  // UI sampling throttle accumulator
  uiMsAcc: number;

  // simple match effects
  celebrationMs: number;

  // for switch cooldown (defense action press)
  switchCooldownMs: number;

  // short anti-jitter cooldown to prevent rapid back-and-forth interceptions
  stealCooldownMs: number;

  // human shooting charge accumulation
  shootChargeMs: number;

  // human "action" (pass) charge accumulation (hold Shift / action button)
  actionChargeMs: number;

  // CPU AI tuning/state
  cpuAi: CpuAiState;
};

export type Engine = {
  state: EngineState;
  input: InputSnapshot;

  // called by host loop
  step: (dtMs: number) => EngineEvent[];

  // derived periodically for React HUD
  getViewModel: () => EngineViewModel;

  // convenience (used by renderer)
  getMatch: () => MatchState;
};