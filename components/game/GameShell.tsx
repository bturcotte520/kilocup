"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasStage } from "@/components/game/CanvasStage";
import { MatchIntroOverlay } from "@/components/game/ui/MatchIntroOverlay";
import { StartScreenOverlay } from "@/components/game/ui/StartScreenOverlay";
import { StandingsPanel } from "@/components/game/ui/panels/StandingsPanel";
import { BracketPanel } from "@/components/game/ui/panels/BracketPanel";
import { EndScreen } from "@/components/game/ui/panels/EndScreen";
import type { MatchSetup } from "@/lib/game/engine/createMatch";
import { kitForTeamId, tournamentMatchStageLabel } from "@/lib/game/tournament/presentation";
import { applyPlayedMatchResult, getCurrentMatchDescriptor, getKiloOpponentTeamId, initTournament } from "@/lib/game/tournament/tournament";

type OpenPanel = "NONE" | "STANDINGS" | "BRACKET";

export function GameShell() {
  const [tournament, setTournament] = useState(() => initTournament(2026));
  const [startOpen, setStartOpen] = useState(true);
  const [introOpen, setIntroOpen] = useState(true);
  const [openPanel, setOpenPanel] = useState<OpenPanel>("NONE");
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);

  const current = getCurrentMatchDescriptor(tournament);
  const opponentId = getKiloOpponentTeamId(tournament);
  const opponent = opponentId ? tournament.teamsById[opponentId] : null;

  const matchId = tournament.currentMatchId ?? "match:none";

  const matchSetup: MatchSetup | undefined = useMemo(() => {
    if (!opponent) return undefined;

    return {
      away: {
        id: opponent.id,
        code3: opponent.code3,
        name: opponent.name,
        flag: opponent.flag,
        kit: kitForTeamId(opponent.id),
      },
    };
  }, [opponent]);

  const showEndScreen = tournament.stage === "COMPLETE";
  const stageLabel = tournamentMatchStageLabel(current);

  const overlayTitle = showEndScreen ? "Tournament Complete" : stageLabel;

  const controlHints = [
    { combo: "WASD / Arrows", action: "Move & jockey" },
    { combo: "Shift", action: "Pass & switch • hold for through balls" },
    { combo: "C", action: "World-class burst" },
    { combo: "Space", action: "Rocket shot (hold & release)" },
    { combo: "Esc", action: "Pause / intel" },
  ];

  const overlayOpponent = opponent
    ? { name: opponent.name, code3: opponent.code3, flag: opponent.flag }
    : tournament.winnerTeamId
      ? (() => {
          const w = tournament.teamsById[tournament.winnerTeamId];
          return { name: w?.name ?? "Winner", code3: w?.code3 ?? "WIN", flag: w?.flag ?? "🏆" };
        })()
      : { name: "Waiting...", code3: "—", flag: "🏟️" };

  const ctaLabel = showEndScreen ? "Restart Tournament" : "Kickoff";

  const panelsOpen = openPanel !== "NONE";
  const hostPaused = startOpen || introOpen || showEndScreen || pauseMenuOpen || panelsOpen;

  const closePanels = useCallback(() => setOpenPanel("NONE"), []);

  const restartTournament = useCallback(() => {
    setTournament(initTournament(2026));
    setStartOpen(true);
    setIntroOpen(true);
    setPauseMenuOpen(false);
    setOpenPanel("NONE");
  }, []);

  // Panel toggles + pause menu: capture phase so we can prevent gameplay keybinds from also firing.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;

      const canShowStandings = tournament.stage === "GROUP";
      const canShowBracket = tournament.stage === "KNOCKOUT" || tournament.stage === "COMPLETE";

      // Escape: close panels first; otherwise toggle pause menu (unless start/intro/end).
      if (k === "Escape") {
        if (openPanel !== "NONE") {
          e.preventDefault();
          e.stopPropagation();
          setOpenPanel("NONE");
          return;
        }

        if (!startOpen && !introOpen && !showEndScreen) {
          e.preventDefault();
          e.stopPropagation();
          setPauseMenuOpen((v) => !v);
          return;
        }
      }

      if (pauseMenuOpen) return;

      // Tab toggles standings.
      if (k === "Tab" && canShowStandings) {
        e.preventDefault();
        e.stopPropagation();
        setOpenPanel((prev) => (prev === "STANDINGS" ? "NONE" : "STANDINGS"));
        return;
      }

      // B toggles bracket.
      if ((k === "b" || k === "B") && canShowBracket) {
        e.preventDefault();
        e.stopPropagation();
        setOpenPanel((prev) => (prev === "BRACKET" ? "NONE" : "BRACKET"));
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openPanel, tournament.stage, pauseMenuOpen, startOpen, introOpen, showEndScreen]);

  const standingsOpen = openPanel === "STANDINGS" && tournament.stage === "GROUP";
  const bracketOpen = openPanel === "BRACKET" && (tournament.stage === "KNOCKOUT" || tournament.stage === "COMPLETE");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <CanvasStage
        matchId={matchId}
        matchSetup={matchSetup}
        hostPaused={hostPaused}
        hudMeta={{ stageLabel }}
        onFullTime={(score) => {
          setTournament((prev) => applyPlayedMatchResult({ state: prev, engineScore: score }));
          setIntroOpen(true);
          setPauseMenuOpen(false);
        }}
      />

      {/* Top strip: menu + round info (in reserved HUD bar area; doesn't overlap pitch) */}
      {!introOpen && !showEndScreen ? (
        <div
          style={{
            position: "absolute",
            top: "calc(10px + var(--rtc-safe-top))",
            left: "calc(12px + var(--rtc-safe-left))",
            right: "calc(12px + var(--rtc-safe-right))",
            height: 92,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.28)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
              color: "rgba(255,255,255,0.92)",
              maxWidth: "min(520px, 65vw)",
            }}
          >
            <div style={{ fontWeight: 950, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 12, opacity: 0.92 }}>
              {stageLabel}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.85, fontSize: 12, fontWeight: 850 }}>
              <span>Tab: Standings</span>
              <span>•</span>
              <span>B: Bracket</span>
              <span>•</span>
              <span>Esc: Close</span>
            </div>
          </div>
          
          <div style={{ display: "flex", gap: 8 }}>
            {tournament.stage === "GROUP" ? (
              <button
                type="button"
                aria-label="Toggle standings panel"
                onClick={() => setOpenPanel((p) => (p === "STANDINGS" ? "NONE" : "STANDINGS"))}
                style={miniButtonStyle}
              >
                Standings
              </button>
            ) : null}
            {tournament.stage === "KNOCKOUT" || tournament.stage === "COMPLETE" ? (
              <button
                type="button"
                aria-label="Toggle bracket panel"
                onClick={() => setOpenPanel((p) => (p === "BRACKET" ? "NONE" : "BRACKET"))}
                style={miniButtonStyle}
              >
                Bracket
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <StandingsPanel open={standingsOpen} tournament={tournament} onClose={closePanels} />
      <BracketPanel open={bracketOpen} tournament={tournament} onClose={closePanels} />

      <StartScreenOverlay
        open={startOpen && !showEndScreen}
        onStart={() => {
          setStartOpen(false);
          setIntroOpen(true);
        }}
      />

      <MatchIntroOverlay
        open={!startOpen && introOpen && !showEndScreen}
        title={overlayTitle}
        opponent={overlayOpponent}
        ctaLabel={ctaLabel}
        onCta={() => {
          if (showEndScreen) {
            restartTournament();
            return;
          }

          setIntroOpen(false);
        }}
      />

      {/* Pause menu overlay: shows controls + quick access to standings/bracket */}
      {pauseMenuOpen && !showEndScreen ? (
        <div
          role="dialog"
          aria-label="Pause menu"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: "calc(22px + var(--rtc-safe-top))",
            paddingRight: "calc(22px + var(--rtc-safe-right))",
            paddingBottom: "calc(22px + var(--rtc-safe-bottom))",
            paddingLeft: "calc(22px + var(--rtc-safe-left))",
            background:
              "radial-gradient(circle at 20% 25%, rgba(249,200,14,0.2), transparent 55%), radial-gradient(circle at 72% 18%, rgba(64,172,255,0.2), transparent 55%), rgba(4,6,18,0.9)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            pointerEvents: "auto",
            overflow: "hidden",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPauseMenuOpen(false);
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(820px, 96%)",
              borderRadius: 28,
              padding: "clamp(20px, 3vw, 30px)",
              background: "linear-gradient(128deg, rgba(8,12,30,0.95), rgba(16,30,60,0.92))",
              border: "1.5px solid rgba(255,255,255,0.12)",
              boxShadow: "0 40px 110px rgba(0,0,0,0.65)",
              color: "rgba(255,255,255,0.95)",
              fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, Arial",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 20,
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: 0.45,
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              <header
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 220 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 26,
                    }}
                  >
                    🏟️
                  </div>
                  <div>
                    <p style={{ margin: 0, letterSpacing: 0.2, textTransform: "uppercase", fontSize: 11, opacity: 0.68 }}>Match brief</p>
                    <h2 style={{ margin: "2px 0", fontSize: 20, letterSpacing: 0.02, fontWeight: 900 }}>Road to the Cup</h2>
                    <p style={{ margin: 0, opacity: 0.78, fontSize: 13 }}>Esc / click outside to resume play</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    aria-label="Resume"
                    onClick={() => setPauseMenuOpen(false)}
                    style={{
                      ...miniButtonStyle,
                      background: "linear-gradient(118deg, #f9c80e, #f86624 55%, #ea3546)",
                      color: "#1c0904",
                      border: "none",
                      boxShadow: "0 18px 40px rgba(240,120,32,0.35)",
                    }}
                  >
                    Resume match
                  </button>
                  <button
                    type="button"
                    aria-label="Restart tournament"
                    onClick={() => {
                      setPauseMenuOpen(false);
                      restartTournament();
                    }}
                    style={{
                      ...miniButtonStyle,
                      borderColor: "rgba(255,255,255,0.24)",
                      color: "rgba(255,255,255,0.92)",
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    Restart run
                  </button>
                </div>
              </header>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <section
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minHeight: 140,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <p style={{ margin: 0, letterSpacing: 0.16, textTransform: "uppercase", fontSize: 11, opacity: 0.75 }}>Match intel</p>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, opacity: 0.86 }}>
                    Regain shape, breathe, and read the midfield. Shift swaps you to the closest defender so you can jump
                    the passing lane before the strike.
                  </p>
                </section>

                <section
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <p style={{ margin: 0, letterSpacing: 0.16, textTransform: "uppercase", fontSize: 11, opacity: 0.75 }}>Quick controls</p>
                  {controlHints.map((hint) => (
                    <div key={hint.combo} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontWeight: 800, letterSpacing: 0.08 }}>{hint.combo}</span>
                      <span style={{ opacity: 0.82, fontSize: 13 }}>{hint.action}</span>
                    </div>
                  ))}
                </section>

                <section
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <p style={{ margin: 0, letterSpacing: 0.16, textTransform: "uppercase", fontSize: 11, opacity: 0.75 }}>Tournament intel</p>
                  {tournament.stage === "GROUP" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPauseMenuOpen(false);
                        setOpenPanel("STANDINGS");
                      }}
                      style={miniButtonStyle}
                    >
                      Standings (Tab)
                    </button>
                  ) : null}
                  {tournament.stage === "KNOCKOUT" || tournament.stage === "COMPLETE" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPauseMenuOpen(false);
                        setOpenPanel("BRACKET");
                      }}
                      style={miniButtonStyle}
                    >
                      Bracket (B)
                    </button>
                  ) : null}
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <EndScreen tournament={tournament} onRestart={restartTournament} />
    </div>
  );
}

const miniButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  background: "var(--rtc-panel-bg)",
  color: "rgba(255,255,255,0.94)",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 900,
  fontSize: "clamp(12px, 1.45vw, 13px)",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "var(--rtc-shadow-sm)",
};