import type { InputSnapshot } from "../engine/engineTypes";

const DEFAULT_INPUT: InputSnapshot = {
  moveVec: { x: 0, y: 0 },

  sprint: false,

  actionDown: false,
  actionPressed: false,
  actionReleased: false,

  shootDown: false,
  shootReleased: false,

  pausePressed: false,
};

const JOYSTICK_DEADZONE = 0.15;

function len2(x: number, y: number): number {
  return x * x + y * y;
}

function len(x: number, y: number): number {
  return Math.sqrt(len2(x, y));
}

function normalize(x: number, y: number): { x: number; y: number } {
  const l = len(x, y);
  if (l <= 1e-6) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

/**
 * The four virtual buttons supported by the mobile controls UI.
 *
 * This is intentionally aligned with the architecture document and the
 * `InputSnapshot` fields in [`engineTypes.ts`](../engine/engineTypes.ts:97).
 */
export type ButtonType = "action" | "shoot" | "sprint" | "pause";

/**
 * Touch input module (headless) that produces an `InputSnapshot` matching the
 * same pattern used by [`keyboard.ts`](./keyboard.ts:49) and
 * [`gamepad.ts`](./gamepad.ts:45).
 *
 * The UI layer (virtual joystick + buttons) is responsible for hit-testing and
 * calling the callback methods exposed on this object.
 *
 * Notes:
 * - `*Pressed` / `*Released` fields are edge-triggered; they must be cleared via
 *   [`clearEdges()`](touch.ts:110) after each sim step.
 * - `*Down` / `sprint` are hold flags and persist until the UI signals release.
 */
export type TouchInput = {
  state: InputSnapshot;
  /** Call once per sim-step to clear edge-triggered flags. */
  clearEdges: () => void;
  /** Cleanup hook (kept for parity with other input modules). */
  dispose: () => void;

  /**
   * Update joystick vector based on UI-provided relative displacement.
   *
   * Expected coordinate space: any scale is acceptable (pixels or normalized),
   * as long as both axes use the same units. The module:
   * - applies a 15% radial deadzone
   * - normalizes output to unit length (direction-only)
   */
  onJoystickMove: (x: number, y: number) => void;

  /** Reset joystick movement back to neutral. */
  onJoystickEnd: () => void;

  /** Signal that a virtual button is now pressed/held. */
  onButtonDown: (button: ButtonType) => void;

  /** Signal that a virtual button is now released. */
  onButtonUp: (button: ButtonType) => void;
};

/**
 * Create a touch input state machine.
 *
 * This version is "headless": instead of attaching `touchstart/touchmove/...`
 * listeners directly, it exposes callback methods that the touch UI components
 * (or a future event-layer) can call after doing hit testing / bounds mapping.
 */
export function createTouchInput(): TouchInput {
  const state: InputSnapshot = { ...DEFAULT_INPUT };

  let disposed = false;

  const onJoystickMove: TouchInput["onJoystickMove"] = (x, y) => {
    if (disposed) return;

    const mag = len(x, y);
    if (mag < JOYSTICK_DEADZONE) {
      state.moveVec = { x: 0, y: 0 };
      return;
    }

    state.moveVec = normalize(x, y);
  };

  const onJoystickEnd: TouchInput["onJoystickEnd"] = () => {
    if (disposed) return;
    state.moveVec = { x: 0, y: 0 };
  };

  const onButtonDown: TouchInput["onButtonDown"] = (button) => {
    if (disposed) return;

    if (button === "sprint") {
      state.sprint = true;
      return;
    }

    if (button === "pause") {
      // Pause is a tap (edge) button.
      state.pausePressed = true;
      return;
    }

    if (button === "action") {
      // Action supports both hold and edges. Only emit "pressed" on the
      // transition from not-held to held.
      if (!state.actionDown) state.actionPressed = true;
      state.actionDown = true;
      return;
    }

    if (button === "shoot") {
      state.shootDown = true;
      return;
    }

    // Exhaustiveness guard (ButtonType is currently fully covered).
    const _exhaustive: never = button;
    return _exhaustive;
  };

  const onButtonUp: TouchInput["onButtonUp"] = (button) => {
    if (disposed) return;

    if (button === "sprint") {
      state.sprint = false;
      return;
    }

    if (button === "pause") {
      // No hold state for pause; do nothing on release.
      return;
    }

    if (button === "action") {
      if (state.actionDown) state.actionReleased = true;
      state.actionDown = false;
      return;
    }

    if (button === "shoot") {
      // Only emit `shootReleased` if we were held down previously.
      if (state.shootDown) state.shootReleased = true;
      state.shootDown = false;
      return;
    }

    // Exhaustiveness guard (ButtonType is currently fully covered).
    const _exhaustive: never = button;
    return _exhaustive;
  };

  const clearEdges = () => {
    state.actionPressed = false;
    state.actionReleased = false;
    state.shootReleased = false;
    state.pausePressed = false;
  };

  const dispose = () => {
    disposed = true;

    // Ensure no held flags "stick" if the module is disposed mid-touch.
    state.moveVec = { x: 0, y: 0 };
    state.sprint = false;

    state.actionDown = false;
    state.shootDown = false;

    clearEdges();
  };

  return {
    state,
    clearEdges,
    dispose,
    onJoystickMove,
    onJoystickEnd,
    onButtonDown,
    onButtonUp,
  };
}