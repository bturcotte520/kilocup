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

type KeyAction =
  | { type: "move"; dir: "up" | "down" | "left" | "right" }
  | { type: "hold"; key: keyof Pick<InputSnapshot, "sprint" | "shootDown" | "actionDown"> }
  | { type: "edge"; key: keyof Pick<InputSnapshot, "actionPressed" | "actionReleased" | "pausePressed"> }
  | null;

function keyToAction(e: KeyboardEvent): KeyAction {
  const k = e.key.toLowerCase();

  // Movement (WASD + arrows)
  if (k === "w" || e.key === "ArrowUp") return { type: "move", dir: "up" };
  if (k === "s" || e.key === "ArrowDown") return { type: "move", dir: "down" };
  if (k === "a" || e.key === "ArrowLeft") return { type: "move", dir: "left" };
  if (k === "d" || e.key === "ArrowRight") return { type: "move", dir: "right" };

  // Sprint (hold) - moved off Shift so Shift can be the unified pass/switch action.
  if (k === "c") return { type: "hold", key: "sprint" };

  // Unified action (hold + release edges)
  if (e.key === "Shift") return { type: "hold", key: "actionDown" };

  // Shoot (hold + release)
  if (e.key === " ") return { type: "hold", key: "shootDown" }; // Space

  // Pause (toggle)
  if (e.key === "Escape") return { type: "edge", key: "pausePressed" };

  return null;
}

export type KeyboardInput = {
  state: InputSnapshot;
  /** Call once per sim-step to clear edge-triggered flags. */
  clearEdges: () => void;
  /** Remove event listeners. */
  dispose: () => void;
};

export function createKeyboardInput(win: Window = window): KeyboardInput {
  const state: InputSnapshot = { ...DEFAULT_INPUT };

  const heldMove = { up: false, down: false, left: false, right: false };

  const recomputeMoveVec = () => {
    const x = (heldMove.right ? 1 : 0) - (heldMove.left ? 1 : 0);
    const y = (heldMove.down ? 1 : 0) - (heldMove.up ? 1 : 0);
    state.moveVec = V.norm({ x, y });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const action = keyToAction(e);
    if (!action) return;

    // Prevent page scrolling / focus issues
    if (e.key.startsWith("Arrow") || e.key === " " || e.key === "Shift") e.preventDefault();

    if (action.type === "move") {
      heldMove[action.dir] = true;
      recomputeMoveVec();
      return;
    }

    if (action.type === "hold") {
      // Special case: Shift is the unified action; it has press/release edges in addition to a hold.
      if (action.key === "actionDown") {
        if (!e.repeat) state.actionPressed = true;
        state.actionDown = true;
        return;
      }

      state[action.key] = true;
      return;
    }

    // Edge-trigger only on initial keydown
    if (!e.repeat) state[action.key] = true;
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const action = keyToAction(e);
    if (!action) return;

    if (e.key.startsWith("Arrow") || e.key === " " || e.key === "Shift") e.preventDefault();

    if (action.type === "move") {
      heldMove[action.dir] = false;
      recomputeMoveVec();
      return;
    }

    if (action.type === "hold") {
      // Shoot release is an edge distinct from "shootDown".
      if (action.key === "shootDown") {
        if (state.shootDown) state.shootReleased = true;
        state.shootDown = false;
        return;
      }

      // Unified action: release edge
      if (action.key === "actionDown") {
        if (state.actionDown) state.actionReleased = true;
        state.actionDown = false;
        return;
      }

      state[action.key] = false;
    }
  };

  win.addEventListener("keydown", onKeyDown, { passive: false });
  win.addEventListener("keyup", onKeyUp, { passive: false });

  const clearEdges = () => {
    state.actionPressed = false;
    state.actionReleased = false;
    state.shootReleased = false;
    state.pausePressed = false;
  };

  const dispose = () => {
    win.removeEventListener("keydown", onKeyDown as EventListener);
    win.removeEventListener("keyup", onKeyUp as EventListener);
  };

  return { state, clearEdges, dispose };
}