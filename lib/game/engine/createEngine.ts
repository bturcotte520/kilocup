import type { Engine, EngineEvent, EngineState, EngineViewModel, InputSnapshot } from "./engineTypes";
import type { MatchSetup } from "./createMatch";
import { DEFAULT_ENGINE_CONFIG } from "./defaultConfig";
import { createMatch } from "./createMatch";
import { resetToKickoff } from "./reset";
import { createCpuAiState } from "../sim/ai";
import { stepSim } from "../sim/step";
import { createVfxState } from "../vfx/goalVfx";

const EMPTY_INPUT: InputSnapshot = {
  moveVec: { x: 0, y: 0 },

  sprint: false,

  actionDown: false,
  actionPressed: false,
  actionReleased: false,

  shootDown: false,
  shootReleased: false,

  pausePressed: false,
};

export type CreateEngineArgs = {
  input?: InputSnapshot;
  matchSetup?: MatchSetup;
};

export function createEngine(args?: CreateEngineArgs): Engine {
  const config = DEFAULT_ENGINE_CONFIG;
  const match = createMatch(config, args?.matchSetup);

  resetToKickoff(config, match);

  const state: EngineState = {
    config,
    match,

    vfx: createVfxState(),

    paused: false,

    kickoffHoldMs: 0,
    kickoffAwaitInput: false,

    uiMsAcc: 0,
    celebrationMs: 0,
    switchCooldownMs: 0,
    stealCooldownMs: 0,

    shootChargeMs: 0,
    actionChargeMs: 0,

    cpuAi: createCpuAiState(),
  };

  // If a host provides an input object (eg keyboard/gamepad snapshot state), we use it directly (mutable ref).
  const input: InputSnapshot = args?.input ?? { ...EMPTY_INPUT };

  const clearEdgeInputs = () => {
    // Important: edge-triggered inputs must be cleared after a sim step (spec).
    input.actionPressed = false;
    input.actionReleased = false;
    input.shootReleased = false;
    input.pausePressed = false;
  };

  const step = (dtMs: number): EngineEvent[] => {
    // During kickoff pause (post-goal), treat ALL inputs as potential "kickoff" input.
    // Do not toggle pause here; the sim will decide when to resume.
    const kickoffActive = state.kickoffHoldMs > 0 || state.kickoffAwaitInput;

    // Pause toggle is handled here so it works even while paused.
    if (!kickoffActive && input.pausePressed) {
      state.paused = !state.paused;
    }

    if (state.paused) {
      clearEdgeInputs();
      return [];
    }

    const events = stepSim({ engine: state, input, dtMs });

    clearEdgeInputs();
    return events;
  };

  const getViewModel = (): EngineViewModel => {
    const home = state.match.teamsById[state.match.homeTeamId];
    const away = state.match.teamsById[state.match.awayTeamId];

    const msRemaining = Math.max(0, state.match.clock.msTotal - state.match.clock.msElapsed);

    const controlledPlayerName =
      state.match.playersById[state.match.controlledPlayerId]?.name ?? "Controlled";

    const possPlayerName = state.match.possession.playerId ? state.match.playersById[state.match.possession.playerId]?.name ?? null : null;

    return {
      home: { name: home.name, code3: home.code3, flag: home.flag, kit: { ...home.kit } },
      away: { name: away.name, code3: away.code3, flag: away.flag, kit: { ...away.kit } },
      score: { ...state.match.score },
      msRemaining,
      phase: state.match.clock.phase,

      paused: state.paused,

      lastEventText: state.match.lastEventText,
      celebrationActive: state.celebrationMs > 0,

      controlledPlayerName,
      possession: {
        teamId: state.match.possession.teamId,
        playerName: possPlayerName,
      },
    };
  };

  const getMatch = () => state.match;

  return { state, input, step, getViewModel, getMatch };
}