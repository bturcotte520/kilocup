"use client";

import React, { useEffect, useState } from "react";

const FLAG_EMOJIS = [
  "🇵🇸",
  "🇺🇸",
  "🇨🇦",
  "🇲🇽",
  "🇧🇷",
  "🇦🇷",
  "🇨🇴",
  "🇺🇾",
  "🇨🇱",
  "🇪🇨",
  "🇵🇪",
  "🇬🇧",
  "🇫🇷",
  "🇩🇪",
  "🇪🇸",
  "🇵🇹",
  "🇮🇹",
  "🇳🇱",
  "🇸🇪",
  "🇩🇰",
  "🇳🇴",
  "🇧🇪",
  "🇨🇭",
  "🇦🇹",
  "🇭🇷",
  "🇵🇱",
  "🇨🇿",
  "🇷🇴",
  "🇷🇸",
  "🇭🇺",
  "🇺🇦",
  "🇹🇷",
  "🇲🇦",
  "🇹🇳",
  "🇩🇿",
  "🇳🇬",
  "🇨🇲",
  "🇨🇮",
  "🇬🇭",
  "🇿🇦",
  "🇰🇪",
  "🇯🇵",
  "🇨🇳",
  "🇰🇷",
  "🇦🇺",
  "🇳🇿",
  "🇶🇦",
  "🇸🇦",
  "🇦🇪",
  "🇮🇷",
  "🇮🇶",
  "🇹🇭",
  "🇻🇳",
  "🇸🇬",
  "🇲🇾",
  "🇮🇳",
];

const FLAG_PATTERN = Array.from({ length: 400 }, (_, idx) => FLAG_EMOJIS[idx % FLAG_EMOJIS.length]);

const FEATURE_CARDS = [
  {
    title: "Group Stage",
    body: "Rack up points, guard the goal difference, and tap Tab for live standings whenever you need the table.",
  },
  {
    title: "Knockout Nights",
    body: "Win-or-go-home football with golden goals and bracket drama. Tap B to inspect the road to the cup.",
  },
  {
    title: "Signature Controls",
    body: "Shift to ping passes or swap defenders, hold to loft the dime, Space to finish, C to burst past the line.",
  },
];

const CONTROL_HINTS = [
  { combo: "WASD / Arrows", action: "Move & jockey" },
  { combo: "Shift", action: "Pass & switch • hold for through balls" },
  { combo: "C", action: "Explosive sprint" },
  { combo: "Space", action: "Power shot (hold & release)" },
  { combo: "Esc", action: "Pause / intel" },
];

export function StartScreenOverlay(props: { open: boolean; onStart: () => void }) {
  const { open, onStart } = props;
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    if (!open && controlsOpen) {
      setControlsOpen(false);
    }
  }, [open, controlsOpen]);

  if (!open) return null;

  return (
    <div
      className="rtc-start-overlay"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "calc(24px + var(--rtc-safe-top))",
        paddingRight: "calc(24px + var(--rtc-safe-right))",
        paddingBottom: "calc(24px + var(--rtc-safe-bottom))",
        paddingLeft: "calc(24px + var(--rtc-safe-left))",
        background:
          "radial-gradient(circle at 20% 20%, rgba(252,201,3,0.18), transparent 60%), radial-gradient(circle at 75% 12%, rgba(40,191,255,0.18), transparent 55%), rgba(3,5,16,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "rgba(255,255,255,0.96)",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      <div className="rtc-start-overlay__flags" aria-hidden>
        {FLAG_PATTERN.map((flag, idx) => (
          <span key={`flag-${idx}`}>{flag}</span>
        ))}
      </div>

      <div className="rtc-start-overlay__panel">
        <div className="rtc-start-overlay__panel-inner">
          <header className="rtc-start-overlay__hero">
            <div className="rtc-start-overlay__crest">
              <span className="rtc-start-overlay__crest-icon">🏆</span>
              <div className="rtc-start-overlay__crest-meta">
                <span>World Championship</span>
                <strong>2026</strong>
              </div>
              <p className="rtc-start-overlay__crest-city">North America host nations</p>
            </div>

            <div className="rtc-start-overlay__hero-copy">
              <p className="rtc-start-overlay__eyebrow">Road to the Cup</p>
              <h1>Road to the Cup 2026</h1>
              <p className="rtc-start-overlay__lede">
                Walk out of the tunnel under night matches, pick your passing lanes, and chase the trophy that defines
                football greatness. One continuous tournament tuned for fast arcade play on keyboard or gamepad.
              </p>
            </div>
          </header>

          <div className="rtc-start-overlay__cta-row">
            <button type="button" aria-label="Start tournament" onClick={onStart} className="rtc-start-overlay__cta">
              <span>Kick off the cup</span>
              <span className="rtc-start-overlay__cta-glow" aria-hidden />
            </button>

            <button
              type="button"
              aria-label="View controls"
              onClick={() => setControlsOpen(true)}
              className="rtc-start-overlay__cta rtc-start-overlay__cta--ghost"
              aria-expanded={controlsOpen}
              disabled={controlsOpen}
            >
              View controls & tips
            </button>
          </div>

          <p className="rtc-start-overlay__tagline">Single-player sprint • Smarter AI • Directional passing</p>

          <section className="rtc-start-overlay__grid" aria-label="Tournament highlights">
            {FEATURE_CARDS.map((card) => (
              <article key={card.title} className="rtc-start-overlay__feature-card">
                <p className="rtc-start-overlay__feature-title">{card.title}</p>
                <p className="rtc-start-overlay__feature-body">{card.body}</p>
              </article>
            ))}
          </section>

          {controlsOpen ? (
            <section className="rtc-start-overlay__controls" aria-label="Controls panel">
              <div className="rtc-start-overlay__controls-header">
                <span>Quick controls</span>
                <div className="rtc-start-overlay__controls-divider" />
                <button
                  type="button"
                  aria-label="Hide controls"
                  onClick={() => setControlsOpen(false)}
                  className="rtc-start-overlay__controls-close"
                >
                  Close
                </button>
              </div>

              <div className="rtc-start-overlay__controls-grid">
                {CONTROL_HINTS.map((hint) => (
                  <div key={hint.combo} className="rtc-start-overlay__controls-item">
                    <kbd>{hint.combo}</kbd>
                    <p>{hint.action}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <footer className="rtc-start-overlay__footnote">
            Press Tab for group standings • Press B for knockout bracket • Esc to pause mid-match
          </footer>
        </div>
      </div>

      <style jsx>{`
        .rtc-start-overlay {
          isolation: isolate;
        }
        .rtc-start-overlay__flags {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          grid-auto-rows: clamp(70px, 10vw, 110px);
          gap: clamp(10px, 1.4vw, 20px);
          align-content: stretch;
          justify-content: stretch;
          font-size: clamp(32px, 4.5vw, 60px);
          opacity: 0.14;
          pointer-events: none;
        }
        .rtc-start-overlay__flags span {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(6,9,22,0.35);
          border-radius: 22px;
          box-shadow: inset 0 0 22px rgba(0,0,0,0.28);
        }
        .rtc-start-overlay__panel {
          position: relative;
          width: min(780px, 100%);
          border-radius: 28px;
          padding: clamp(22px, 4vw, 32px);
          background: linear-gradient(130deg, rgba(8,12,32,0.96), rgba(16,28,58,0.94));
          border: 1.5px solid rgba(255,255,255,0.12);
          box-shadow: 0 40px 110px rgba(0,0,0,0.65);
          font-family: var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", Roboto, Arial;
          overflow: hidden;
        }
        .rtc-start-overlay__panel::after {
          content: "";
          position: absolute;
          inset: 22px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          opacity: 0.5;
          pointer-events: none;
        }
        .rtc-start-overlay__panel-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: clamp(18px, 3vw, 26px);
        }
        .rtc-start-overlay__hero {
          display: grid;
          grid-template-columns: minmax(180px, 220px) 1fr;
          gap: 18px;
          align-items: stretch;
        }
        @media (max-width: 720px) {
          .rtc-start-overlay__hero {
            grid-template-columns: 1fr;
          }
        }
        .rtc-start-overlay__crest {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 20px 18px;
          border-radius: 20px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .rtc-start-overlay__crest-icon {
          font-size: clamp(22px, 3vw, 30px);
          filter: drop-shadow(0 6px 12px rgba(0,0,0,0.45));
        }
        .rtc-start-overlay__crest-meta {
          display: flex;
          flex-direction: column;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-size: clamp(11px, 1.4vw, 12px);
          font-weight: 800;
        }
        .rtc-start-overlay__crest-meta strong {
          font-size: clamp(16px, 2.3vw, 20px);
        }
        .rtc-start-overlay__crest-city {
          margin: 0;
          font-size: clamp(11px, 1.4vw, 12px);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          opacity: 0.78;
        }
        .rtc-start-overlay__hero-copy {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .rtc-start-overlay__eyebrow {
          margin: 0;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          font-size: 12px;
          opacity: 0.68;
        }
        .rtc-start-overlay__hero-copy h1 {
          margin: 0;
          font-size: clamp(34px, 5.4vw, 46px);
          letter-spacing: -0.01em;
          font-weight: 900;
        }
        .rtc-start-overlay__lede {
          margin: 0;
          font-size: clamp(15px, 2.2vw, 17px);
          line-height: 1.55;
          opacity: 0.9;
          max-width: 60ch;
        }
        .rtc-start-overlay__cta-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }
        .rtc-start-overlay__cta {
          position: relative;
          border: none;
          border-radius: 16px;
          padding: clamp(14px, 2.2vw, 18px);
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          background: linear-gradient(120deg, #f9c80e, #f86624 55%, #ea3546);
          color: #150802;
          box-shadow: 0 24px 60px rgba(240,120,32,0.45);
          overflow: hidden;
        }
        .rtc-start-overlay__cta:focus-visible {
          outline: 2px solid rgba(255,255,255,0.6);
          outline-offset: 4px;
        }
        .rtc-start-overlay__cta span:first-of-type {
          position: relative;
          z-index: 1;
        }
        .rtc-start-overlay__cta-glow {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.45), transparent 60%);
          animation: rtcStartOverlayShine 4s infinite;
        }
        .rtc-start-overlay__cta--ghost {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.94);
          border: 1px solid rgba(255,255,255,0.22);
          letter-spacing: 0.04em;
          text-transform: none;
          font-size: clamp(14px, 2vw, 16px);
          box-shadow: 0 18px 36px rgba(0,0,0,0.4);
        }
        .rtc-start-overlay__cta--ghost:disabled {
          opacity: 0.55;
        }
        .rtc-start-overlay__tagline {
          margin: 0;
          font-size: 13px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.72;
        }
        .rtc-start-overlay__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }
        .rtc-start-overlay__feature-card {
          border-radius: 18px;
          padding: 16px 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 120px;
        }
        .rtc-start-overlay__feature-title {
          margin: 0;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: 12px;
          color: var(--rtc-yellow, #f9c80e);
        }
        .rtc-start-overlay__feature-body {
          margin: 0;
          font-size: 13px;
          line-height: 1.45;
          opacity: 0.86;
        }
        .rtc-start-overlay__controls {
          border-radius: 22px;
          padding: 18px;
          background: rgba(5,8,22,0.9);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .rtc-start-overlay__controls-header {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 800;
          opacity: 0.78;
        }
        .rtc-start-overlay__controls-divider {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.14);
        }
        .rtc-start-overlay__controls-close {
          border: none;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.92);
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .rtc-start-overlay__controls-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
        }
        .rtc-start-overlay__controls-item {
          border-radius: 14px;
          padding: 12px 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rtc-start-overlay__controls-item p {
          margin: 0;
          font-size: 13px;
          opacity: 0.85;
          line-height: 1.3;
        }
        kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 5px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(0,0,0,0.35);
          font-size: 12px;
          letter-spacing: 0.14em;
          font-weight: 700;
        }
        .rtc-start-overlay__footnote {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        @keyframes rtcStartOverlayShine {
          0% {
            transform: translateX(-60%);
            opacity: 0;
          }
          25% {
            opacity: 0.9;
          }
          60% {
            transform: translateX(60%);
            opacity: 0;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
