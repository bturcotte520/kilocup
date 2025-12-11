import type { EngineConfig } from "./engineTypes";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  // Canonical world units from spec
  pitchW: 120,
  pitchH: 80,

  // Goal mouth spans +/- goalHalfW around center (along Y axis).
  // Goal is beyond the pitch bounds by `goalDepth`.
  goalHalfW: 10,
  goalDepth: 4,

  // Fixed timestep simulation
  simDtMs: 1000 / 60,
  maxFrameDtMs: 100,

  // React HUD sampling rate (low frequency)
  uiHz: 10,

  // For this subtask we keep it short. (Spec calls for 6 minutes later.)
  matchMsTotal: 3 * 60 * 1000,
};