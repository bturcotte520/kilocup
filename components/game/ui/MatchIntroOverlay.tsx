"use client";

import React from "react";

export function MatchIntroOverlay(props: {
  open: boolean;
  title: string;
  opponent: { name: string; code3: string; flag: string };
  ctaLabel: string;
  onCta: () => void;
}) {
  const { open, title, opponent, ctaLabel, onCta } = props;

  if (!open) return null;

  return (
    <div
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
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        color: "rgba(255,255,255,0.94)",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          borderRadius: "var(--rtc-radius-lg)",
          padding: "clamp(14px, 3.5vw, 18px)",
          background: "var(--rtc-panel-bg-strong)",
          boxShadow: "var(--rtc-shadow-md)",
          border: "1px solid var(--rtc-panel-border)",
          fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, Arial",
        }}
      >
        <div style={{ fontWeight: 950, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.9, fontSize: 12 }}>
          {title}
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div aria-hidden="true" style={{ fontSize: 48, lineHeight: 1 }}>
            {opponent.flag}
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 1000, lineHeight: 1.1 }}>
              {opponent.name}
            </div>
            <div style={{ marginTop: 4, opacity: 0.9, fontWeight: 900, letterSpacing: 1 }}>
              {opponent.code3}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, opacity: 0.88, fontSize: 13, lineHeight: 1.35 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Accessibility & Controls</div>
          <div>
            Move: WASD/Arrows • Action (Pass/Switch): Shift (tap=nearest to your pointed direction; hold=farther) • Sprint: C • Shoot: Space (hold+release) • Pause: Esc
          </div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Note: Emoji flags are decorative and do not convey critical information.
          </div>
        </div>

        <button
          type="button"
          aria-label={ctaLabel}
          onClick={onCta}
          style={{
            marginTop: 18,
            width: "100%",
            border: "none",
            borderRadius: 12,
            padding: "12px 14px",
            background: "var(--rtc-yellow)",
            color: "#111111",
            fontWeight: 950,
            letterSpacing: 0.6,
            cursor: "pointer",
            boxShadow: "0 14px 40px rgba(246,201,69,0.18)",
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}