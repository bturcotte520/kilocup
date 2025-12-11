"use client";

import * as React from "react";

import type { ButtonType } from "@/lib/game/input/touch";

export type VirtualButtonsProps = {
  onButtonDown: (button: ButtonType) => void;
  onButtonUp: (button: ButtonType) => void;
};

type ButtonDef = {
  type: ButtonType;
  label: string;
  icon: string;
  // Tailwind background color token without opacity (we apply /30 or /60)
  bgClass: string;
};

const BUTTONS: readonly ButtonDef[] = [
  { type: "action", label: "Action", icon: "⚡", bgClass: "bg-yellow-400" },
  { type: "shoot", label: "Shoot", icon: "⚽", bgClass: "bg-red-500" },
  { type: "sprint", label: "Sprint", icon: "»»", bgClass: "bg-blue-500" },
  { type: "pause", label: "Pause", icon: "❚❚", bgClass: "bg-zinc-500" },
] as const;

export function VirtualButtons({ onButtonDown, onButtonUp }: VirtualButtonsProps) {
  // Track which touch identifier is holding which button.
  const touchToButtonRef = React.useRef<Map<number, ButtonType>>(new Map());

  const [activeButtons, setActiveButtons] = React.useState<Set<ButtonType>>(() => new Set());

  const syncActiveButtons = React.useCallback(() => {
    const next = new Set<ButtonType>();
    for (const b of touchToButtonRef.current.values()) next.add(b);
    setActiveButtons(next);
  }, []);

  const handleTouchStartFor = React.useCallback(
    (button: ButtonType) => (e: React.TouchEvent<HTMLButtonElement>) => {
      e.preventDefault();

      for (const t of Array.from(e.changedTouches)) {
        // If the touch is already associated, don't double-trigger.
        if (touchToButtonRef.current.has(t.identifier)) continue;

        touchToButtonRef.current.set(t.identifier, button);
        onButtonDown(button);
      }

      syncActiveButtons();
    },
    [onButtonDown, syncActiveButtons],
  );

  const handleTouchEndFor = React.useCallback(
    (button: ButtonType) => (e: React.TouchEvent<HTMLButtonElement>) => {
      e.preventDefault();

      for (const t of Array.from(e.changedTouches)) {
        const mapped = touchToButtonRef.current.get(t.identifier);
        if (mapped !== button) continue;

        touchToButtonRef.current.delete(t.identifier);
        onButtonUp(button);
      }

      syncActiveButtons();
    },
    [onButtonUp, syncActiveButtons],
  );

  return (
    <div
      className="touch-none pointer-events-none fixed right-8 z-[1000]"
      style={{
        bottom: "max(32px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="pointer-events-auto grid grid-cols-2 grid-rows-2 gap-4">
        {BUTTONS.map((b) => {
          const isActive = activeButtons.has(b.type);

          return (
            <button
              key={b.type}
              type="button"
              className={[
                "touch-none select-none",
                "flex h-16 w-16 flex-col items-center justify-center rounded-full",
                "border-2 border-white/60 text-white",
                "transition-opacity duration-100 ease-out",
                isActive ? "opacity-60 shadow-[inset_0_4px_8px_rgba(0,0,0,0.3)]" : "opacity-30",
                isActive ? `${b.bgClass}/60` : `${b.bgClass}/30`,
              ].join(" ")}
              onTouchStart={handleTouchStartFor(b.type)}
              onTouchEnd={handleTouchEndFor(b.type)}
              onTouchCancel={handleTouchEndFor(b.type)}
            >
              <div className="text-lg font-bold leading-none">{b.icon}</div>
              <div className="mt-0.5 text-[10px] font-bold leading-none tracking-wide">
                {b.label.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}