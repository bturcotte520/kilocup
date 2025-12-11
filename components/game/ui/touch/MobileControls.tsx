"use client";

import * as React from "react";

import type { ButtonType, TouchInput } from "@/lib/game/input/touch";
import { VirtualButtons } from "@/components/game/ui/touch/VirtualButtons";
import { VirtualJoystick } from "@/components/game/ui/touch/VirtualJoystick";

export type MobileControlsProps = {
  touchInput: TouchInput;
};

export function MobileControls({ touchInput }: MobileControlsProps) {
  const handleJoystickMove = React.useCallback(
    (x: number, y: number) => {
      touchInput.onJoystickMove(x, y);
    },
    [touchInput],
  );

  const handleJoystickEnd = React.useCallback(() => {
    touchInput.onJoystickEnd();
  }, [touchInput]);

  const handleButtonDown = React.useCallback(
    (button: ButtonType) => {
      touchInput.onButtonDown(button);
    },
    [touchInput],
  );

  const handleButtonUp = React.useCallback(
    (button: ButtonType) => {
      touchInput.onButtonUp(button);
    },
    [touchInput],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[1000]">
      <VirtualJoystick onJoystickMove={handleJoystickMove} onJoystickEnd={handleJoystickEnd} />
      <VirtualButtons onButtonDown={handleButtonDown} onButtonUp={handleButtonUp} />
    </div>
  );
}