"use client";

import * as React from "react";

export type VirtualJoystickProps = {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
};

const BASE_SIZE_PX = 120;
const STICK_SIZE_PX = 50;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function VirtualJoystick({ onJoystickMove, onJoystickEnd }: VirtualJoystickProps) {
  const baseRef = React.useRef<HTMLDivElement | null>(null);

  // Track the single touch that "owns" the joystick interaction.
  const activeTouchIdRef = React.useRef<number | null>(null);

  const [active, setActive] = React.useState(false);
  const [stickOffsetPx, setStickOffsetPx] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const maxTravelPx = React.useMemo(() => (BASE_SIZE_PX - STICK_SIZE_PX) / 2, []);

  const updateFromClientPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // 1) Visual clamp for stick position within base.
      const dist = Math.hypot(dx, dy);
      const clampedDist = dist > maxTravelPx && dist > 1e-6 ? maxTravelPx : dist;
      const scale = dist > 1e-6 ? clampedDist / dist : 0;

      const visualX = dx * scale;
      const visualY = dy * scale;

      setStickOffsetPx({ x: visualX, y: visualY });

      // 2) Normalized vector for gameplay [-1, 1] (clamped radially).
      const nxRaw = dx / maxTravelPx;
      const nyRaw = dy / maxTravelPx;
      const nLen = Math.hypot(nxRaw, nyRaw);
      const nScale = nLen > 1 ? 1 / nLen : 1;

      const nx = clamp(nxRaw * nScale, -1, 1);
      const ny = clamp(nyRaw * nScale, -1, 1);

      onJoystickMove(nx, ny);
    },
    [maxTravelPx, onJoystickMove],
  );

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (activeTouchIdRef.current != null) return;

      const t = e.changedTouches[0];
      if (!t) return;

      activeTouchIdRef.current = t.identifier;
      setActive(true);
      updateFromClientPoint(t.clientX, t.clientY);
    },
    [updateFromClientPoint],
  );

  const endTouch = React.useCallback(() => {
    activeTouchIdRef.current = null;
    setActive(false);
    setStickOffsetPx({ x: 0, y: 0 });
    onJoystickEnd();
  }, [onJoystickEnd]);

  // Track move/end events even if the touch leaves the joystick element.
  React.useEffect(() => {
    if (!active) return;

    const handleMove = (e: TouchEvent) => {
      e.preventDefault();

      const activeId = activeTouchIdRef.current;
      if (activeId == null) return;

      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeId) {
          updateFromClientPoint(t.clientX, t.clientY);
          break;
        }
      }
    };

    const handleEndOrCancel = (e: TouchEvent) => {
      e.preventDefault();

      const activeId = activeTouchIdRef.current;
      if (activeId == null) return;

      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeId) {
          endTouch();
          break;
        }
      }
    };

    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEndOrCancel, { passive: false });
    window.addEventListener("touchcancel", handleEndOrCancel, { passive: false });

    return () => {
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEndOrCancel);
      window.removeEventListener("touchcancel", handleEndOrCancel);
    };
  }, [active, endTouch, updateFromClientPoint]);

  return (
    <div
      ref={baseRef}
      className={[
        "touch-none pointer-events-auto fixed left-8 z-[1000]",
        "flex items-center justify-center rounded-full",
        "border-2 border-white/30 bg-white/10",
        active ? "opacity-60" : "opacity-30",
      ].join(" ")}
      style={{
        width: `${BASE_SIZE_PX}px`,
        height: `${BASE_SIZE_PX}px`,
        bottom: "max(32px, env(safe-area-inset-bottom))",
      }}
      onTouchStart={handleTouchStart}
    >
      <div
        className={[
          "flex items-center justify-center rounded-full",
          "border-2 border-white/80 bg-white/50",
          "transition-transform duration-150 ease-out",
          active ? "shadow-[0_0_12px_rgba(255,255,255,0.35)]" : "",
        ].join(" ")}
        style={{
          width: `${STICK_SIZE_PX}px`,
          height: `${STICK_SIZE_PX}px`,
          transform: `translate3d(${stickOffsetPx.x}px, ${stickOffsetPx.y}px, 0)`,
        }}
      />
    </div>
  );
}