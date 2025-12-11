import type { InputSnapshot } from "../engine/engineTypes";
import { V } from "../math/vec2";

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

const DEADZONE = 0.18;

function readFirstGamepad(nav: Navigator): Gamepad | null {
  // `navigator.getGamepads()` can return sparse arrays with null entries.
  const gps = nav.getGamepads?.() ?? [];
  for (const gp of gps) {
    if (gp && gp.connected) return gp;
  }
  return null;
}

function btn(gp: Gamepad, index: number): boolean {
  const b = gp.buttons[index];
  return !!b && b.pressed;
}

/**
 * Basic gamepad support (no UI):
 * - Left stick: move
 * - LB: sprint
 * - A: pass (tap)
 * - B: shoot (hold to charge, release to kick)
 * - Y: switch (tap)
 *
 * Graceful no-op when no gamepad is available.
 */
export type GamepadInput = {
  state: InputSnapshot;
  /** Poll hardware and update `state`. Should be called once per frame (or before sim step). */
  update: () => void;
  /** Clear edge-triggered flags after a sim-step. */
  clearEdges: () => void;
};

export function createGamepadInput(nav: Navigator = navigator): GamepadInput {
  const state: InputSnapshot = { ...DEFAULT_INPUT };

  // Track previous button state to compute edges.
  let prev = {
    a: false,
    b: false,
  };

  const update = () => {
    const gp = readFirstGamepad(nav);
    if (!gp) {
      // No-op but keep state stable (and ensure hold flags are off).
      state.moveVec = { x: 0, y: 0 };
      state.sprint = false;

      state.actionDown = false;
      state.shootDown = false;

      prev = { a: false, b: false };
      return;
    }

    const raw = { x: gp.axes[0] ?? 0, y: gp.axes[1] ?? 0 };
    const mag = V.len(raw);

    state.moveVec = mag >= DEADZONE ? V.norm(raw) : { x: 0, y: 0 };

    // Buttons (standard mapping)
    const aNow = btn(gp, 0);
    const bNow = btn(gp, 1);
    const lbNow = btn(gp, 4);

    state.sprint = lbNow;

    // Action: A (hold + press/release edges)
    state.actionDown = aNow;
    if (aNow && !prev.a) state.actionPressed = true;
    if (!aNow && prev.a) state.actionReleased = true;

    // Shoot: hold on B, released edge on falling edge
    state.shootDown = bNow;
    if (!bNow && prev.b) state.shootReleased = true;

    prev = { a: aNow, b: bNow };
  };

  const clearEdges = () => {
    state.actionPressed = false;
    state.actionReleased = false;
    state.shootReleased = false;
    // pausePressed unused for gamepad in this subtask
  };

  return { state, update, clearEdges };
}