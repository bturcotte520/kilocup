"use client";

import React, { memo, useMemo } from "react";
import type { BracketMatchVM } from "@/lib/game/tournament/presentation";
import { getBracketVM } from "@/lib/game/tournament/presentation";
import type { TournamentState } from "@/lib/game/tournament/types";

type RoundColumn = {
  key: "r16" | "qf" | "sf" | "f";
  title: string;
  matches: BracketMatchVM[];
};

export const BracketPanel = memo(function BracketPanel(props: {
  open: boolean;
  tournament: TournamentState;
  onClose: () => void;
}) {
  const { open, tournament, onClose } = props;

  const bracket = useMemo(() => getBracketVM({ state: tournament }), [tournament]);

  const columns: RoundColumn[] = useMemo(
    () => [
      { key: "r16", title: "R16", matches: bracket.r16 },
      { key: "qf", title: "QF", matches: bracket.qf },
      { key: "sf", title: "SF", matches: bracket.sf },
      { key: "f", title: "Final", matches: bracket.f },
    ],
    [bracket],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Knockout bracket"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "calc(16px + var(--rtc-safe-top))",
        paddingRight: "calc(16px + var(--rtc-safe-right))",
        paddingBottom: "calc(16px + var(--rtc-safe-bottom))",
        paddingLeft: "calc(16px + var(--rtc-safe-left))",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          borderRadius: "var(--rtc-radius-lg)",
          padding: "clamp(12px, 2.6vw, 16px)",
          background: "var(--rtc-panel-bg-strong)",
          boxShadow: "var(--rtc-shadow-md)",
          border: "1px solid var(--rtc-panel-border)",
          color: "rgba(255,255,255,0.94)",
          fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, Arial",
          maxHeight: "calc(100dvh - 32px - var(--rtc-safe-top) - var(--rtc-safe-bottom))",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, letterSpacing: 1, textTransform: "uppercase" }}>Bracket</div>
            <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>B: toggle • Esc / click outside: close</div>
          </div>

          <button
            type="button"
            aria-label="Close bracket panel"
            onClick={onClose}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.94)",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 900,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "var(--rtc-shadow-sm)",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 14, position: "relative", overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(220px, 1fr))",
              gap: 16,
              alignItems: "start",
              minWidth: 900,
              position: "relative",
              paddingBottom: 6,
            }}
          >
            {/* Simple connecting-lines overlay.
                This is intentionally lightweight & approximate (not perfect bracket geometry),
                but gives a clear visual grouping between rounds. */}
            <svg
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              viewBox="0 0 1000 260"
              preserveAspectRatio="none"
            >
              <BracketLines />
            </svg>

            {columns.map((col) => (
              <div key={col.key}>
                <div style={{ opacity: 0.9, fontWeight: 950, letterSpacing: 1, textTransform: "uppercase" }}>
                  {col.title}
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.matches.map((m) => (
                    <MatchNode key={m.id} m={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {bracket.r16.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>Bracket unavailable.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function MatchNode(props: { m: BracketMatchVM }) {
  const { m } = props;

  const border = m.highlightKiloPath ? "rgba(246,201,69,0.72)" : "rgba(255,255,255,0.12)";
  const bg = m.highlightKiloPath ? "rgba(246,201,69,0.12)" : "rgba(255,255,255,0.06)";

  const short = (t: BracketMatchVM["home"] | BracketMatchVM["away"]) => (t ? t.code3 : "—");
  const flag = (t: BracketMatchVM["home"] | BracketMatchVM["away"]) => (t ? t.flag : "🏟️");

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: 12,
        padding: 10,
        boxShadow: m.highlightKiloPath ? "0 10px 28px rgba(246,201,69,0.10)" : "0 10px 28px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <Line flag={flag(m.home)} code={short(m.home)} name={m.home?.name ?? "TBD"} />
          <Line flag={flag(m.away)} code={short(m.away)} name={m.away?.name ?? "TBD"} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{m.resultText ?? "—"}</div>
          <div style={{ opacity: 0.78, fontSize: 12, fontWeight: 850 }}>{m.roundLabel}</div>
        </div>
      </div>
    </div>
  );
}

function Line(props: { flag: string; code: string; name: string }) {
  const { flag, code, name } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
        {flag}
      </span>
      <span style={{ fontWeight: 950, letterSpacing: 0.6 }}>{code}</span>
      <span style={{ opacity: 0.88, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </span>
    </div>
  );
}

function BracketLines() {
  // A small “bracket feel” with vertical stems and horizontal connectors between columns.
  // Uses a normalized viewBox; it scales with container.
  const stroke = "rgba(255,255,255,0.14)";
  const stroke2 = "rgba(255,255,255,0.10)";

  return (
    <g fill="none" strokeWidth="2">
      {/* R16 -> QF */}
      <path stroke={stroke} d="M245 35 H305" />
      <path stroke={stroke} d="M245 95 H305" />
      <path stroke={stroke2} d="M305 35 V95" />

      <path stroke={stroke} d="M245 165 H305" />
      <path stroke={stroke} d="M245 225 H305" />
      <path stroke={stroke2} d="M305 165 V225" />

      {/* QF -> SF */}
      <path stroke={stroke} d="M495 65 H555" />
      <path stroke={stroke} d="M495 195 H555" />
      <path stroke={stroke2} d="M555 65 V195" />

      {/* SF -> Final */}
      <path stroke={stroke} d="M745 130 H805" />
      <path stroke={stroke2} d="M805 80 V180" />
    </g>
  );
}