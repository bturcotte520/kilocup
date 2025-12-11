"use client";

import React, { memo, useMemo } from "react";
import type { GroupId, TournamentState } from "@/lib/game/tournament/types";
import { getGroupStandingsVM, getKiloGroupId } from "@/lib/game/tournament/presentation";

export const StandingsPanel = memo(function StandingsPanel(props: {
  open: boolean;
  tournament: TournamentState;
  onClose: () => void;
}) {
  const { open, tournament, onClose } = props;

  const groupId: GroupId | null = useMemo(() => getKiloGroupId(tournament), [tournament]);
  const rows = useMemo(() => {
    if (!groupId) return [];
    return getGroupStandingsVM({ state: tournament, groupId });
  }, [tournament, groupId]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Group standings"
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
        // click-outside closes
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(860px, 100%)",
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
            <div style={{ fontWeight: 950, letterSpacing: 1, textTransform: "uppercase" }}>
              Standings{groupId ? ` — Group ${groupId}` : ""}
            </div>
            <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
              Tab: toggle • Esc / click outside: close
            </div>
          </div>

          <button
            type="button"
            aria-label="Close standings panel"
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

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.85 }}>
                <th style={thStyle}>Team</th>
                <th style={thStyleCenter}>P</th>
                <th style={thStyleCenter}>W</th>
                <th style={thStyleCenter}>D</th>
                <th style={thStyleCenter}>L</th>
                <th style={thStyleCenter}>GF</th>
                <th style={thStyleCenter}>GA</th>
                <th style={thStyleCenter}>GD</th>
                <th style={thStyleCenter}>Pts</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const bg = r.isKilo ? "rgba(246,201,69,0.18)" : "transparent";
                const border = r.isKilo ? "rgba(246,201,69,0.55)" : "rgba(255,255,255,0.08)";

                return (
                  <tr key={r.team.id} style={{ background: bg }}>
                    <td style={{ ...tdStyle, borderTop: `1px solid ${border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
                          {r.team.flag}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <div style={{ fontWeight: r.isKilo ? 950 : 800 }}>
                            {r.team.name}{" "}
                            <span style={{ opacity: 0.85, fontWeight: 900, letterSpacing: 0.6 }}>
                              {r.team.code3}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <Swatch color={r.team.kit.primary} />
                            <Swatch color={r.team.kit.secondary} />
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.played}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.won}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.drawn}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.lost}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.gf}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.ga}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}` }}>{r.gd}</td>
                    <td style={{ ...tdStyleCenter, borderTop: `1px solid ${border}`, fontWeight: 950 }}>
                      {r.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>Standings unavailable.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function Swatch(props: { color: string }) {
  return (
    <span
      title={props.color}
      style={{
        width: 12,
        height: 12,
        borderRadius: 3,
        background: props.color,
        border: "1px solid rgba(255,255,255,0.25)",
        display: "inline-block",
      }}
    />
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 12,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

const thStyleCenter: React.CSSProperties = {
  ...thStyle,
  textAlign: "center",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 13,
};

const tdStyleCenter: React.CSSProperties = {
  ...tdStyle,
  textAlign: "center",
  whiteSpace: "nowrap",
};