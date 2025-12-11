"use client";

import React, { memo, useMemo } from "react";
import type { TournamentState } from "@/lib/game/tournament/types";
import { getTournamentOutcomeVM } from "@/lib/game/tournament/presentation";

export const EndScreen = memo(function EndScreen(props: {
  tournament: TournamentState;
  onRestart: () => void;
}) {
  const { tournament, onRestart } = props;

  const outcome = useMemo(() => getTournamentOutcomeVM(tournament), [tournament]);

  if (outcome.status === "IN_PROGRESS") return null;

  const isChampion = outcome.status === "CHAMPION";

  return (
    <div
      role="dialog"
      aria-label="Tournament complete"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "calc(16px + var(--rtc-safe-top))",
        paddingRight: "calc(16px + var(--rtc-safe-right))",
        paddingBottom: "calc(16px + var(--rtc-safe-bottom))",
        paddingLeft: "calc(16px + var(--rtc-safe-left))",
        background: "radial-gradient(circle at 50% 35%, rgba(246,201,69,0.20), rgba(0,0,0,0.86) 55%, rgba(0,0,0,0.92))",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        color: "rgba(255,255,255,0.94)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          borderRadius: "var(--rtc-radius-lg)",
          padding: "clamp(14px, 3.5vw, 18px)",
          background: "var(--rtc-panel-bg-strong)",
          border: "1px solid var(--rtc-panel-border)",
          boxShadow: "var(--rtc-shadow-lg)",
          fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, Arial",
          textAlign: "center",
          maxHeight: "calc(100dvh - 32px - var(--rtc-safe-top) - var(--rtc-safe-bottom))",
          overflow: "auto",
        }}
      >
        <div style={{ fontWeight: 950, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.9, fontSize: 12 }}>
          Road to the Cup 2026
        </div>

        <div style={{ marginTop: 10, fontSize: "clamp(28px, 6vw, 34px)", fontWeight: 1000, lineHeight: 1.1 }}>
          {isChampion ? "Champions" : "Eliminated"}
        </div>

        <div aria-hidden="true" style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <Trophy />
        </div>

        {isChampion ? (
          <>
            <div style={{ marginTop: 14, fontSize: 16, opacity: 0.92, fontWeight: 850 }}>
              Kilo are the Champions of 2026.
            </div>
            <div style={{ marginTop: 8, opacity: 0.78, fontSize: 13 }}>
              Confetti placeholder: (coming later)
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14, fontSize: 15, opacity: 0.9 }}>
            Stage reached: <span style={{ fontWeight: 950 }}>{outcome.reachedStageLabel}</span>
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label="Restart tournament"
            onClick={onRestart}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "12px 14px",
              minWidth: 220,
              background: "var(--rtc-yellow)",
              color: "#111111",
              fontWeight: 950,
              letterSpacing: 0.6,
              cursor: "pointer",
              boxShadow: "0 14px 40px rgba(246,201,69,0.18)",
            }}
          >
            Restart Tournament
          </button>

          <div
            style={{
              alignSelf: "center",
              opacity: 0.75,
              fontSize: 12,
              maxWidth: 260,
              lineHeight: 1.25,
            }}
          >
            This resets the bracket + groups and returns you to the next kickoff.
          </div>
        </div>
      </div>
    </div>
  );
});

function Trophy() {
  // Pure CSS trophy (simple, placeholder for later canvas/VFX).
  return (
    <div style={{ width: 220, height: 200, position: "relative" }}>
      {/* Cup */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 22,
          transform: "translateX(-50%)",
          width: 140,
          height: 100,
          borderRadius: "0 0 70px 70px",
          background: "linear-gradient(180deg, #F6C945, #C99A17)",
          border: "1px solid rgba(255,255,255,0.25)",
          boxShadow: "0 18px 50px rgba(246,201,69,0.18)",
        }}
      />
      {/* Rim */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 14,
          transform: "translateX(-50%)",
          width: 160,
          height: 26,
          borderRadius: 14,
          background: "linear-gradient(180deg, #FFE48A, #F6C945)",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      {/* Handles */}
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 40,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "10px solid rgba(246,201,69,0.95)",
          borderRightColor: "transparent",
          borderBottomColor: "transparent",
          transform: "rotate(-10deg)",
          opacity: 0.95,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 16,
          top: 40,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "10px solid rgba(246,201,69,0.95)",
          borderLeftColor: "transparent",
          borderBottomColor: "transparent",
          transform: "rotate(10deg)",
          opacity: 0.95,
        }}
      />
      {/* Stem */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 124,
          transform: "translateX(-50%)",
          width: 36,
          height: 34,
          borderRadius: 10,
          background: "linear-gradient(180deg, #E8B936, #A57B14)",
          border: "1px solid rgba(255,255,255,0.22)",
        }}
      />
      {/* Base */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 152,
          transform: "translateX(-50%)",
          width: 140,
          height: 30,
          borderRadius: 12,
          background: "linear-gradient(180deg, #3A3A3A, #141414)",
          border: "1px solid rgba(255,255,255,0.16)",
        }}
      />
      {/* Plaque */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 160,
          transform: "translateX(-50%)",
          width: 92,
          height: 14,
          borderRadius: 7,
          background: "rgba(246,201,69,0.85)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      />
    </div>
  );
}