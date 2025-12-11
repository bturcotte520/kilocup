"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Score } from "@/lib/game/engine/engineTypes";
import type { Engine, EngineViewModel, InputSnapshot } from "@/lib/game/engine/engineTypes";
import type { MatchSetup } from "@/lib/game/engine/createMatch";
import { createEngine } from "@/lib/game/engine/createEngine";
import { createKeyboardInput } from "@/lib/game/input/keyboard";
import { createGamepadInput } from "@/lib/game/input/gamepad";
import { renderFrame } from "@/lib/game/render/renderFrame";
import { Hud } from "@/components/game/ui/Hud";

type Size = { w: number; h: number; dpr: number };

// Reserve UI bars so HUD doesn't overlap the pitch.
const UI_TOP_PX = 140;
const UI_BOTTOM_PX = 92;

function getCanvasSize(): Size {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;

  // Prefer visualViewport when available (mobile browser UI / address bar changes).
  // Fallback to innerWidth/innerHeight.
  const vv = typeof window !== "undefined" ? window.visualViewport : null;

  const w = vv?.width ?? window.innerWidth;
  const fullH = vv?.height ?? window.innerHeight;

  // Canvas only renders the playable field region (middle slice).
  const h = Math.max(1, fullH - UI_TOP_PX - UI_BOTTOM_PX);

  return { w, h, dpr };
}

export function CanvasStage(props: {
  matchId: string;
  matchSetup?: MatchSetup;
  hostPaused?: boolean;
  hudMeta?: { stageLabel: string };
  onFullTime?: (score: Score) => void;
}) {
  const { matchId, matchSetup, hostPaused, hudMeta, onFullTime } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const keyboardRef = useRef<ReturnType<typeof createKeyboardInput> | null>(null);
  const gamepadRef = useRef<ReturnType<typeof createGamepadInput> | null>(null);

  // Merged snapshot passed to engine as a stable mutable ref.
  const inputRef = useRef<InputSnapshot | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastMsRef = useRef<number>(0);
  const accMsRef = useRef<number>(0);
  const uiAccMsRef = useRef<number>(0);

  const matchSetupRef = useRef<MatchSetup | undefined>(matchSetup);
  const hostPausedRef = useRef<boolean>(!!hostPaused);
  const hudMetaRef = useRef<{ stageLabel: string } | undefined>(hudMeta);
  const onFullTimeRef = useRef<((score: Score) => void) | undefined>(onFullTime);

  const reportedFullTimeForMatchIdRef = useRef<string | null>(null);

  const [vm, setVm] = useState<EngineViewModel | null>(null);

  // Keep refs in sync so the render loop always sees the latest props without re-binding.
  useEffect(() => {
    matchSetupRef.current = matchSetup;
  }, [matchSetup]);

  useEffect(() => {
    hostPausedRef.current = !!hostPaused;
  }, [hostPaused]);

  useEffect(() => {
    hudMetaRef.current = hudMeta;
  }, [hudMeta]);

  useEffect(() => {
    onFullTimeRef.current = onFullTime;
  }, [onFullTime]);

  const makeEngine = useMemo(() => {
    return () => {
      const merged: InputSnapshot =
        inputRef.current ?? {
          moveVec: { x: 0, y: 0 },

          sprint: false,

          actionDown: false,
          actionPressed: false,
          actionReleased: false,

          shootDown: false,
          shootReleased: false,

          pausePressed: false,
        };

      inputRef.current = merged;

      const engine = createEngine({ input: merged, matchSetup: matchSetupRef.current });
      engineRef.current = engine;
      setVm(engine.getViewModel());

      // reset timing accumulators so the new match doesn't fast-forward
      lastMsRef.current = perfNowMs();
      accMsRef.current = 0;
      uiAccMsRef.current = 0;

      // allow new FULL_TIME reporting for this match
      reportedFullTimeForMatchIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Input devices are created once and reused across matches.
    const keyboard = createKeyboardInput();
    keyboardRef.current = keyboard;

    const gamepad = createGamepadInput();
    gamepadRef.current = gamepad;

    // Create initial engine instance (tournament can immediately replace it via matchId effect).
    makeEngine();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let size = getCanvasSize();
    const applySize = () => {
      size = getCanvasSize();

      // CSS size
      canvas.style.position = "absolute";
      canvas.style.left = "0";
      canvas.style.top = `${UI_TOP_PX}px`;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;

      // Backing store
      canvas.width = Math.max(1, Math.floor(size.w * size.dpr));
      canvas.height = Math.max(1, Math.floor(size.h * size.dpr));

      // Render in CSS pixel space
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };

    applySize();

    const onResize = () => applySize();
    window.addEventListener("resize", onResize);

    // Mobile Safari / Chrome: address bar collapse/expand changes visualViewport
    // without always triggering window resize.
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onResize);
      vv.addEventListener("scroll", onResize);
    }

    const onVisibility = () => {
      // Reset accumulator to avoid big catch-up when tab returns
      accMsRef.current = 0;
      lastMsRef.current = perfNowMs();
    };
    document.addEventListener("visibilitychange", onVisibility);

    lastMsRef.current = perfNowMs();
    accMsRef.current = 0;
    uiAccMsRef.current = 0;

    const loop = () => {
      const engine = engineRef.current;
      if (!engine) return;

      const now = perfNowMs();
      const frameDt = Math.min(engine.state.config.maxFrameDtMs, now - lastMsRef.current);
      lastMsRef.current = now;

      // Poll gamepad once per frame (if connected).
      gamepadRef.current?.update();

      // Merge inputs into the engine snapshot.
      const kb = keyboardRef.current?.state;
      const gp = gamepadRef.current?.state;
      const merged = inputRef.current;

      if (merged && kb && gp) {
        const gpMoveActive = gp.moveVec.x * gp.moveVec.x + gp.moveVec.y * gp.moveVec.y > 1e-6;

        merged.moveVec = gpMoveActive ? gp.moveVec : kb.moveVec;

        merged.sprint = kb.sprint || gp.sprint;

        merged.actionDown = kb.actionDown || gp.actionDown;
        merged.actionPressed = kb.actionPressed || gp.actionPressed;
        merged.actionReleased = kb.actionReleased || gp.actionReleased;

        merged.shootDown = kb.shootDown || gp.shootDown;
        merged.shootReleased = kb.shootReleased || gp.shootReleased;

        // Pause is keyboard-only for now (Esc).
        merged.pausePressed = kb.pausePressed;
      }

      // Host pause stops sim progression entirely (match intro / between matches).
      if (!hostPausedRef.current) {
        accMsRef.current += frameDt;

        // Fixed timestep simulation
        const simDt = engine.state.config.simDtMs;
        while (accMsRef.current >= simDt) {
          const events = engine.step(simDt);

          // FULL TIME event -> notify host once per matchId
          if (events.length && reportedFullTimeForMatchIdRef.current !== matchId) {
            const ft = events.find((e) => e.type === "FULL_TIME");
            if (ft) {
              reportedFullTimeForMatchIdRef.current = matchId;
              onFullTimeRef.current?.(ft.score);
            }
          }

          // Ensure source input devices also clear edge flags after each sim step
          // (engine clears the merged snapshot internally).
          keyboardRef.current?.clearEdges();
          gamepadRef.current?.clearEdges();

          accMsRef.current -= simDt;
        }
      } else {
        // While paused by host, clear edge inputs so they don't "buffer" into kickoff.
        keyboardRef.current?.clearEdges();
        gamepadRef.current?.clearEdges();
      }

      // Render
      // (ctx is already set to CSS pixel space; renderFrame assumes vp is CSS pixels)
      renderFrame({
        ctx,
        engine: engine.state,
        vp: { w: size.w, h: size.h },
        nowMs: now,
      });

      // Throttled HUD view model
      uiAccMsRef.current += frameDt;
      const uiInterval = 1000 / engine.state.config.uiHz;
      if (uiAccMsRef.current >= uiInterval) {
        uiAccMsRef.current = 0;
        setVm(engine.getViewModel());
      }

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      window.removeEventListener("resize", onResize);

      const vv = window.visualViewport;
      if (vv) {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", onResize);
      }

      document.removeEventListener("visibilitychange", onVisibility);

      keyboardRef.current?.dispose();
      keyboardRef.current = null;

      engineRef.current = null;
    };
  }, [makeEngine]);

  // Recreate engine when tournament advances to a new match.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!keyboardRef.current) return; // not mounted yet

    makeEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} />

      {vm ? <Hud vm={vm} hudMeta={hudMetaRef.current} layout={{ topPx: UI_TOP_PX, bottomPx: UI_BOTTOM_PX }} /> : null}
    </div>
  );
}

function perfNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}